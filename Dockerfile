FROM node:22-alpine

RUN mkdir /opt/geocontext
WORKDIR /opt/geocontext

COPY package.json package-lock.json .
RUN npm install --omit=dev

COPY server.js .
COPY src src/
COPY public public/

USER node
EXPOSE 3000
CMD ["npm", "start"]
