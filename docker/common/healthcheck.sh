#!/bin/sh

set -e

PORT=${VITRINE_PORT:-$(jq -r .port /config/settings.json)}
ADDRESS=${VITRINE_ADDRESS:-$(jq -r .address /config/settings.json)}
ADDRESS=${ADDRESS:-localhost}

wget -q --spider http://$ADDRESS:$PORT/health || exit 1
