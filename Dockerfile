FROM node:22-alpine AS builder

WORKDIR /opt/geocontext
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src src/
RUN npm run build

FROM node:22-alpine

WORKDIR /opt/geocontext
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /opt/geocontext/dist dist/

USER node
EXPOSE 3000
ENV TRANSPORT_TYPE=http
CMD ["node", "dist/index.js"]