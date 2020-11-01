FROM node:12

WORKDIR /app

COPY . ./

RUN npm install

RUN cd ./2-0010 && npm install

EXPOSE 8883 8888

CMD [ "npm", "start"]