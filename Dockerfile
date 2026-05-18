FROM node:24-alpine AS builder

WORKDIR /opt/geocontext
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src src/
COPY scripts scripts/
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine

WORKDIR /opt/geocontext
COPY --from=builder /opt/geocontext/package.json package.json
COPY --from=builder /opt/geocontext/node_modules node_modules/
COPY --from=builder /opt/geocontext/dist dist/
# Remove package-manager tooling from the runtime image.
# This keeps the runtime surface smaller and avoids Trivy findings
# coming from npm's bundled dependencies rather than the app itself.
RUN rm -rf \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /opt/yarn-v* \
  && rm -f \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/corepack \
      /usr/local/bin/yarn \
      /usr/local/bin/yarnpkg

USER node
EXPOSE 3000
ENV TRANSPORT_TYPE=http
CMD ["node", "--use-env-proxy", "dist/index.js"]
