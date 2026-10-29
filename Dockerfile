FROM node:22-alpine AS verify
RUN apk add --no-cache ffmpeg
WORKDIR /verify
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . ./
RUN npm test
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund
RUN rm -rf /verify/tests /verify/validacion /verify/referencias

FROM node:22-alpine
# R45 · tar y pg_dump para el resguardo externo (pg_dump 17 puede respaldar servidores PostgreSQL 17 o anteriores)
RUN apk add --no-cache ffmpeg tar postgresql17-client
WORKDIR /app
COPY --from=verify --chown=node:node /verify/ ./
ENV NODE_ENV=production PORT=5185 OROK_LISTEN_HOST=0.0.0.0 OROK_PRIVATE_DIR=/app/private OROK_REHEARSAL=1
USER node
EXPOSE 5185
CMD ["node", "server.cjs"]
