# Cloud Run image for the API. The reranker model is ~23MB and loads once at
# container start, so a warm instance answers in ~4ms rather than paying 2.5s
# on every request the way a per-request runtime would.
FROM node:26-slim

WORKDIR /app

# Dependencies first, so a code change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Source only. data/ is gitignored and not needed at query time: chunks come
# from Postgres and the snapshot id arrives as CORPUS_SNAPSHOT_ID.
COPY src ./src
COPY certs ./certs

ENV NODE_ENV=production
# Container filesystems are ephemeral. The audio cache still helps within an
# instance; it is an optimisation, not a store of record.
ENV AUDIO_DIR=/tmp/audio
ENV PORT=8080

EXPOSE 8080
CMD ["node", "--experimental-strip-types", "src/server.ts"]
