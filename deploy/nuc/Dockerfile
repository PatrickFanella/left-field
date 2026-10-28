FROM node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d

ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
ARG SOURCE_TREE_SHA256=unknown

LABEL org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.source="dsa-seats" \
      org.opencontainers.image.source-tree-sha256="${SOURCE_TREE_SHA256}"

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN chmod 0555 /app/deploy/nuc/run-with-secrets.sh

EXPOSE 3000
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0"]
