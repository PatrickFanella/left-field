# Node runtime security backport

The maintained application build pins Node 22.23.4 and its official image digest.
This is the fixed 22.x release in the [October 21 advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).

For a production image that needs only the runtime patch, use
`Dockerfile.node-security` with `APP_IMAGE` set to a retained local image tag.
Verify that tag's full immutable ID against the deployed container before building.
Set `SOURCE_TREE_SHA256` to the checksum of its verified retained source archive;
keep `releases/<checksum>/source.tar` and its extracted `source/` tree. Do not
invent a source identity or reuse a receipt from a different image.

The backport replaces only `/usr/local/bin/node`, updates `NODE_VERSION`, and
sets the source archive label. It retains the application, dependencies, compiled
assets, entrypoint and command from the original image. It does not update npm,
the operating-system packages or independent trust stores. Confirm Node's module
ABI is unchanged and that the original filesystem layers precede the patch layer.

Build on Kvant's host Docker daemon with the existing application image and the
pinned official Node image available. Run an isolated canary using the effective
production command, environment and read-only data mounts, with a temporary
loopback listener. Verify public-page contracts and native dependencies before
activation. Acquire the existing deployment lock, retain the original image and
Compose configuration, and add an app-only image override. Recreate only the app;
verify effective environment, mounts, command and all unrelated container IDs.
Check the live Node version, application monitor and representative public routes.

Rollback selects the recorded original image and recreates only the app with the
original Compose files. Preserve newer data. Run the factual backup source check
after activation and take a fresh encrypted backup for the new image identity;
backup and isolated restore are separate qualification stages.
