# Despliegue de Tutoría UNAS en una VM (Docker)

Arquitectura: `proxy` (Caddy, HTTPS, único con puertos 80/443) → `web` (Nginx, frontend) y `api` (.NET 10) → `db` (PostgreSQL 17).
Además: `migrate` (aplica el esquema SQL al iniciar) y `backup` (copia diaria, 14 días, en `./backups`).

## Requisitos de la VM
- Linux (Ubuntu 22.04/24.04), 2 vCPU, 4 GB de RAM, 20 GB de disco.
- Docker Engine + plugin Compose.
- Un nombre DNS apuntando a la VM y los puertos 80 y 443 abiertos.
- Una cuenta SMTP (puerto 587 con STARTTLS) para enviar los códigos de verificación.

## Primera instalación
```bash
git clone <repositorio> tutoria-unas && cd tutoria-unas
cp .env.example .env        # completa TODOS los valores (ver comentarios dentro)
openssl rand -hex 24        # → POSTGRES_PASSWORD
openssl rand -base64 48     # → CUENTAS_CODIGO_KEY
docker compose up -d --build
docker compose run --rm bootstrap    # una sola vez: catálogos, periodos y primer administrador
```
Entra en `https://<TUTORIA_DOMAIN>/login` con el correo y la contraseña de `TUTORIA_ADMIN_*`.
Después borra `TUTORIA_ADMIN_PASSWORD` de `.env`. Desde el sistema, coordinación importa el padrón y crea las cuentas.

`bootstrap` es idempotente: si el administrador ya existe no lo modifica.

## Operación
```bash
docker compose ps                      # estado y healthchecks
docker compose logs -f api             # registros de la API
docker compose up -d --build           # actualizar tras git pull (migra el esquema solo)
docker compose exec db pg_isready      # base de datos
```
Restaurar una copia: `docker compose exec -T db pg_restore -U tutoria_app -d tutoria_unas --clean --if-exists < backups/tutoria_AAAA-MM-DD_HHMM.dump`

## Notas importantes
- **Volumen `keys`**: guarda las claves de Data Protection (códigos de verificación y sesiones). No lo borres; si se pierde,
  las sesiones abiertas se invalidan. Respáldalo junto con `pgdata`.
- **HTTPS**: con `TUTORIA_TLS=internal` Caddy emite un certificado propio (red interna). Para evitar la advertencia del navegador
  usa un dominio público con 80/443 abiertos y pon un correo en `TUTORIA_TLS` (Let's Encrypt), o instala la CA de Caddy
  (`docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt .`) en los equipos.
- **Secretos**: `.env` contiene contraseñas; permisos `chmod 600 .env` y nunca lo subas a git.
- El backend solo se expone dentro de la red de Docker; PostgreSQL no publica puertos.
- Las copias de seguridad también deberían salir de la VM (rsync o snapshot de la VM).
