#!/bin/sh
# Writes the runtime config read by the SPA at startup, so secrets stay out of the image.
set -e

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

cat > /usr/share/nginx/html/app-config.json <<EOF
{
  "apiBaseUrl": "$(json_escape "${API_BASE_URL:-}")",
  "syncfusionLicense": "$(json_escape "${SYNCFUSION_LICENSE:-}")"
}
EOF
