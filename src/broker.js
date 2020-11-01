const aedes = require("aedes");
const net = require("net");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const log = require("./log");
const config = require("./config");
const mongooseService = require("../2-0010/services/mongoose.service");
const Device = require("../2-0010/models/device.model");

const http = require("http");
const ws = require("websocket-stream");

const broker = {};

broker.listen = function listen(cb) {
  broker.aedes = aedes();

  broker.server = net.createServer(broker.aedes.handle);

  broker.httpServer = http.createServer();

  ws.createServer({ server: broker.httpServer }, broker.aedes.handle);

  log.info(`Starting MQTT broker on port:${config.mqtt.port}`);

  broker.server.listen(config.mqtt.port);

  broker.httpServer.listen(config.mqtt.wsPort, function () {
    log.info("Aedes MQTT-WS listening on port: " + config.mqtt.wsPort);
  });

  cb();
};

broker.close = function close(cb) {
  broker.aedes.close(() => {
    log.info("Broker is closed");
    cb();
  });
};

broker.publishEventInit = () => {
  // connect to mongo database
  mongooseService.connect(config.mongo.address + config.mongo.port + "/restapi");

  // setup event trigger
  broker.aedes.on("publish", async (packet, client) => {
    // internal messages set client to null
    if (client) {
      let payload = JSON.parse(packet.payload.toString());
      // Get JWT

      let topics = packet.topic.split("/");
      let deviceId = topics[1];

      await axios
        .get(config.api.address + config.api.port + "/device/" + deviceId, {
          headers: {
            authorization: payload.jwt,
          },
        })
        .then(function (res) {
          let deviceRes = res.data;

          if (deviceRes.clientId == client.id) {
            console.log("in Here");
            if (topics[2] == "status") {
              console.log("recived");
              Device.findById(deviceRes._id).then((device) => {
                device.status[0] = payload.data[0];
                device.status[1] = payload.data[1];
                device.save();
              });
            }
          }
        })
        .catch((error) => {
          log.info(`Client: ${client.id} failed to publish ${error}`);
        });
      log.info("PUBLISHED");
    }
  });
};

broker.setupAuthentication = function setupAuthentication() {
  // connect authentication
  broker.aedes.authenticate = async (client, username, password, cb) => {
    let options = {
      headers: {
        authorization: password,
      },
    };

    await axios
      .post(config.api.address + config.api.port + "/auth/valid", {}, options)
      .then(function (res) {
        if (res.status == 200) {
          cb(null, true);
          log.info(`Client: ${client.id} connected`);
        } else {
          cb(false, false);
        }
      })
      .catch((error) => {
        log.info(`Client: ${client.id} not authorised to connect`);
        return cb(error, null); // returns unauthorised MQTT code 5
      });
  };

  // publish authentication
  broker.aedes.authorizePublish = async (client, packet, cb) => {
    let payload = JSON.parse(packet.payload.toString());
    // Check JWT
    let options = {
      headers: {
        authorization: payload.jwt,
      },
    };

    await axios
      .post(config.api.address + config.api.port + "/auth/valid", {}, options)
      .then(function (res) {
        if (res.status == 200) {
          log.info(`Client: ${client.id} has valid JWT`);
        } else {
          return cb(false, false);
        }
      })
      .catch((error) => {
        log.info(`Client: ${client.id} not authorised to publish`);
        return cb(error, null); // returns unauthorised MQTT code 5
      });

    // confirm first level of topic matches userId
    let authToken = payload.jwt.split(" ")[1];
    let decoded = jwt.decode(authToken);
    let topics = packet.topic.split("/");

    if (topics[0] != decoded.userId) {
      log.info(`Client: ${client.id} has invalid topic`);
      return cb(false, false);
    }

    cb(null, true);
  };
};

module.exports = broker;
