# syntax=docker/dockerfile:1
# Imagen del frontend: compila con Vite y sirve estáticos con Nginx. Contexto: la carpeta frontend/.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Sin VITE_API_BASE_URL el frontend llama a /api en el mismo dominio (Nginx lo reenvía al backend).
ENV VITE_DATA_SOURCE=api
RUN pnpm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN cp -r /usr/share/nginx/html/assets /opt/assets-nuevos
COPY docker/30-conservar-assets.sh /docker-entrypoint.d/30-conservar-assets.sh
RUN chmod +x /docker-entrypoint.d/30-conservar-assets.sh
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1/healthz || exit 1
