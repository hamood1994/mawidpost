#!/usr/bin/env bash
# Runs forever under PM2. Every 60s: if GitHub has a newer commit, pull, build and restart ONLY mawidpost.
# If the build fails, the previous version stays running. Touches nothing else on the server.
cd "$(dirname "$0")/.."
BRANCH=main
while true; do
  git fetch -q origin "$BRANCH" 2>/dev/null
  LOCAL=$(git rev-parse HEAD); REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "$LOCAL")
  if [ "$LOCAL" != "$REMOTE" ]; then
    echo "$(date -Is) new version $REMOTE"
    if git merge --ff-only -q "origin/$BRANCH" && npm install --no-audit --no-fund --silent && npm run build --silent; then
      pm2 restart mawidpost --update-env >/dev/null && pm2 restart mawidpost-worker --update-env >/dev/null
      echo "$(date -Is) deployed $REMOTE"
    else
      echo "$(date -Is) build FAILED, reverting to $LOCAL"
      git reset -q --hard "$LOCAL"
      npm install --no-audit --no-fund --silent; npm run build --silent && pm2 restart mawidpost >/dev/null
      sleep 600   # do not retry the same broken commit every minute
    fi
  fi
  sleep 60
done
