#!/usr/bin/env bash
# Adds the server-only secrets to .env.local. Values you type are hidden and never printed.
# Run on the VPS inside /var/www/mawidpost:   bash scripts/setup-env.sh
set -euo pipefail
cd "$(dirname "$0")/.."
F=.env.local
touch "$F"; chmod 600 "$F"

# make sure the file ends with a newline before appending
if [ -s "$F" ] && [ -n "$(tail -c1 "$F")" ]; then echo >> "$F"; fi

has() { grep -q "^$1=" "$F"; }
put() { has "$1" || printf '%s=%s\n' "$1" "$2" >> "$F"; }
ask() { # name  prompt  [secret]
  if has "$1"; then echo "✓ $1 already set"; return; fi
  local v
  if [ "${3:-}" = "secret" ]; then read -r -s -p "$2: " v; echo; else read -r -p "$2: " v; fi
  if [ -n "$v" ]; then printf '%s=%s\n' "$1" "$v" >> "$F"; fi
}

put SITE_URL "https://mawidpost.com"
put TOKEN_ENC_KEY "$(openssl rand -hex 32)"
put CRON_SECRET "$(openssl rand -hex 24)"
put META_GRAPH_VERSION "v25.0"
ask SUPABASE_SERVICE_ROLE_KEY "Supabase secret / service_role key (hidden)" secret
ask META_APP_ID "Meta App ID"
ask META_APP_SECRET "Meta App Secret (hidden)" secret
ask ANTHROPIC_API_KEY "Anthropic API key (optional, press Enter to skip; hidden)" secret
echo "Done. Keys in .env.local (names only):"; cut -d= -f1 "$F"
