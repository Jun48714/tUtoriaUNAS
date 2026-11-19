#!/bin/sh
# Conserva los archivos con hash de despliegues anteriores. Las pestañas abiertas antes de actualizar siguen
# pidiendo sus nombres viejos; sin esto fallan hasta que el usuario recarga. Se borran los de más de 14 días.
set -e
DESTINO=/usr/share/nginx/html/assets
if [ -d /opt/assets-nuevos ]; then
  mkdir -p "$DESTINO"
  cp -r /opt/assets-nuevos/. "$DESTINO"/
  find "$DESTINO" -type f -mtime +14 -delete 2>/dev/null || true
fi
