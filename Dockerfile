FROM node:22-alpine

RUN npm install -g npm

WORKDIR /opt/geocontext

#  package-lock.json
COPY tsconfig.json package.json .
RUN npm install --no-dev
COPY src src/
RUN npm run build

USER node
EXPOSE 3000
ENV TRANSPORT_TYPE=http
CMD ["npm", "start"]
