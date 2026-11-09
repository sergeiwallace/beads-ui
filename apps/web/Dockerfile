# The beads-ui web app in a container (T-3.5): the server, the built client and bd. The Beads
# store it serves lives on the /work volume (docker-compose.yml), never in the image.
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

# bd from its npm package, pinned to the version the tests run against.
RUN npm install --global @beads/bd@1.3.4 && bd --version

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/bd-node/package.json packages/bd-node/
COPY packages/web-ui/package.json packages/web-ui/
COPY plugins/beads-ui/package.json plugins/beads-ui/
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build --workspace apps/web \
  && ln -s /app/apps/web/bin/beads-ui-web.mjs /usr/local/bin/beads-ui-web

ENV BEADS_UI_PORT=4810 \
  BEADS_ACTOR=beads-ui-web
WORKDIR /work
ENTRYPOINT ["/app/apps/web/docker/entrypoint.sh"]
