FROM node:20-alpine AS deps

WORKDIR /app

COPY docker/certs/ /tmp/local-certs/
COPY package*.json ./
RUN if [ -f /tmp/local-certs/local-ca.crt ]; then \
      export NODE_EXTRA_CA_CERTS=/tmp/local-certs/local-ca.crt; \
    fi; \
    npm ci

FROM deps AS build

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY docker/certs/ /tmp/local-certs/
COPY package*.json ./
RUN if [ -f /tmp/local-certs/local-ca.crt ]; then \
      export NODE_EXTRA_CA_CERTS=/tmp/local-certs/local-ca.crt; \
    fi; \
    npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node

EXPOSE 3000 3001 3002 3003

CMD ["node", "dist/apps/main-api/server.js"]
