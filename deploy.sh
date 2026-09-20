#!/usr/bin/env bash
# On your Mac:  ./deploy.sh "what changed"   -> saves to GitHub; the server updates itself within ~2 minutes.
set -e
cd "$(dirname "$0")"
git add -A
git commit -m "${1:-update}" || echo "nothing new to save"
git push
echo "Sent. mawidpost.com updates itself in about 2 minutes."
