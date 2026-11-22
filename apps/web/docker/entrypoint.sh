#!/bin/sh
set -eu

port="${BEADS_UI_PORT:-4810}"
config="${XDG_CONFIG_HOME:-$HOME/.config}/beads-ui/beads-ui.toml"

cd /work
if [ ! -d .beads ]; then
  if [ -n "${BEADS_UI_REPO:-}" ] && [ ! -d .git ]; then
    git clone "$BEADS_UI_REPO" .
  fi
  if [ ! -d .git ]; then
    git init --quiet
  fi
  if [ ! -d .beads ]; then
    bd init --non-interactive --skip-hooks --prefix "${BEADS_UI_PREFIX:-work}"
  fi
fi

if [ ! -f "$config" ]; then
  mkdir -p "$(dirname "$config")"
  user="${BEADS_UI_USER:-owner}"
  cat > "$config" <<EOF
# Written by the container's first start (apps/web/docker/entrypoint.sh); edit it in the
# beads-ui-home volume. docs/procedures/web-run.md, "Set up once", explains each key.
[hosts]
allow_repos = ["work"]

[auth]
hosts = ["127.0.0.1", "localhost"]
origins = ["http://127.0.0.1:${port}"]
dispatch_identities = ["${user}@localhost"]
browser_secret = "state:browser-secret"
receiver_token = "state:receiver-tokens.json"
mcp_token = "state:mcp-token"
configured_user = "${user}"
signing_key = "state:dispatch-signing-key"
signing_key_id = "compose-$(date -u +%Y%m%d)"
trusted_keys = "state:trusted-dispatch-keys.json"
EOF
fi

exec beads-ui-web --port "$port"
