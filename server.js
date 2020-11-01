const config = require("./src/config");
const broker = require("./src/broker");
const log = require("./src/log");

const app = {};

app.init = function init() {
  broker.listen(() => {
    broker.setupAuthentication();
    log.info("Started mqtt broker");
    app.notifyStatus();
  });

  broker.publishEventInit();
};

app.notifyStatus = function notifyStatus() {
  log.info("MQTT Broker is running correctly...");

  app.intervalTimer = setTimeout(() => {
    app.notifyStatus();
  }, config.notifyInterval * 1000);
};

app.shutdown = function shutdown() {
  broker.close();
  clearInterval(app.intervalTimer);
  process.exit();
};

process.on("SIGINT", () => {
  log.info("Got SIGINT, gracefully shutting down");
  app.shutdown();
});

process.on("SIGTERM", () => {
  log.info("Got SIGTERM, gracefully shutting down");
  app.shutdown();
});

app.init();

module.exports = app;
