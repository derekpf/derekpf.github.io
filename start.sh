#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PREVIEW_DIR="$ROOT_DIR/.jekyll-preview"
DESTINATION="$PREVIEW_DIR/site"
HOST="${JEKYLL_HOST:-0.0.0.0}"
PORT="${JEKYLL_PORT:-4000}"
CONFIG_FILES="$ROOT_DIR/_config.yml"
OVERRIDE_CONFIG="$PREVIEW_DIR/config.yml"

cd "$ROOT_DIR"

if ! command -v bundle >/dev/null 2>&1; then
  echo "Error: Bundler is not installed or is not on PATH." >&2
  exit 1
fi

if ! bundle check >/dev/null 2>&1; then
  echo "Error: Ruby dependencies are missing. Run 'bundle install' first." >&2
  exit 1
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  echo "Error: JEKYLL_PORT must be a number; received '$PORT'." >&2
  exit 1
fi

port_is_available() {
  ruby -rsocket -e 'server = TCPServer.new(ARGV.fetch(0), ARGV.fetch(1).to_i); server.close' "$HOST" "$1" >/dev/null 2>&1
}

if ! port_is_available "$PORT"; then
  if [[ -n "${JEKYLL_PORT:-}" ]]; then
    echo "Error: port $PORT is already in use. Choose another with JEKYLL_PORT=PORT ./start.sh." >&2
    exit 1
  fi

  requested_port="$PORT"
  for _ in {1..20}; do
    PORT=$((PORT + 1))
    if port_is_available "$PORT"; then
      echo "Port $requested_port is already in use; using port $PORT instead."
      break
    fi
  done

  if ! port_is_available "$PORT"; then
    echo "Error: could not find an available port between $((requested_port + 1)) and $PORT." >&2
    exit 1
  fi
fi

mkdir -p "$PREVIEW_DIR" "$DESTINATION"

if command -v convert >/dev/null 2>&1; then
  echo "ImageMagick detected; responsive image generation is enabled."
else
  printf '%s\n' 'imagemagick:' '  enabled: false' > "$OVERRIDE_CONFIG"
  CONFIG_FILES="$CONFIG_FILES,$OVERRIDE_CONFIG"
  echo "ImageMagick not found; responsive image generation is disabled for this preview."
fi

echo "Starting Jekyll at http://localhost:$PORT/"

bundle exec jekyll serve \
  --config "$CONFIG_FILES" \
  --destination "$DESTINATION" \
  --host "$HOST" \
  --disable-disk-cache \
  --no-watch \
  --port "$PORT"
