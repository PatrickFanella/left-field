FROM node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d

ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
ARG SOURCE_TREE_SHA256=unknown

LABEL org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.source="https://git.subcult.tv/subculture-collective/left-field" \
      org.opencontainers.image.source-tree-sha256="${SOURCE_TREE_SHA256}"

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY tools/minimatch-compat/ ./tools/minimatch-compat/
RUN npm ci

COPY . .
# Only tracked, LFS-materialized sources enter the retained native backup archive.
# The archive is prepared before docker build; it contains no runtime credentials.
RUN if [ -f deploy/ci/source.tar.gz ]; then \
      test "$(gzip -cd /app/deploy/ci/source.tar.gz | sha256sum | cut -d ' ' -f 1)" = "$SOURCE_TREE_SHA256" || exit 1; \
    fi && printf '{"schema_version":1,"source_commit":"%s"}\n' "$VCS_REF" > public/build-info.json
RUN CI=true NODE_OPTIONS=--max-old-space-size=2048 npm run build
RUN chmod 0555 /app/deploy/nuc/run-with-secrets.sh

EXPOSE 3000
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0"]
