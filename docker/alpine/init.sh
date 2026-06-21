#!/bin/sh

set -e

# PUID / PGID — the host user/group that owns your mounted data and that the
# app should run as. Defaults match the image's build-time user (1000:1000).
# Point these at `id -u` / `id -g` of whoever owns your files and the app will
# run as them — no `chown` of your data or `user:` juggling required.
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

# Ensure configuration exists. Done before dropping privileges so the copy can
# write into a freshly-created (possibly root-owned) /config on first start; the
# chown below then hands the whole dir to PUID:PGID.
if [ ! -f "/config/settings.json" ]; then
  cp -a /defaults/settings.json /config/settings.json
fi

# Extract config file path from arguments
config_file=""
next_is_config=0
for arg in "$@"; do
  if [ "$next_is_config" -eq 1 ]; then
    config_file="$arg"
    break
  fi
  case "$arg" in
    -c|--config)
      next_is_config=1
      ;;
    -c=*|--config=*)
      config_file="${arg#*=}"
      break
      ;;
  esac
done

# If no config argument is provided, set the default and add it to the args
if [ -z "$config_file" ]; then
  config_file="/config/settings.json"
  set -- --config=/config/settings.json "$@"
fi

# If we're root (the default), align ownership of the app's OWN state to
# PUID:PGID and then drop to that unprivileged user before running the app, so
# filebrowser itself never runs as root. We deliberately do NOT recurse into
# /srv: that's your media, which should already be owned by PUID (running
# `chown -R` over a large library on every boot would be slow, and it isn't
# ours to re-own). If the operator forced a non-root user (`user:` in their
# runtime config), we can't chown — so we just run as whoever we already are.
if [ "$(id -u)" = "0" ]; then
  chown -R "$PUID:$PGID" /config /database 2>/dev/null || true
  exec su-exec "$PUID:$PGID" filebrowser "$@"
fi

exec filebrowser "$@"
