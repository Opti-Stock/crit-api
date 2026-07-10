# Despliegue Docker de crit-api

## Objetivo

La API se construye en una imagen unica y se ejecuta con comandos distintos para cada app interna:

- main API: `node dist/apps/main-api/server.js`
- admin API: `node dist/apps/admin-api/server.js`
- check-in API: `node dist/apps/checkin-api/server.js`
- super-admin API: `node dist/apps/super-admin-api/server.js`

Esto permite correr todo local con `docker compose` o desplegar servicios separados en Render usando el mismo `Dockerfile`.

## Variables requeridas

Cada servicio necesita las mismas variables base del proyecto:

```txt
DATABASE_URL=postgres://...
JWT_SECRET=...
CORS_ORIGIN=http://localhost:5173
MAIN_API_PORT=3000
ADMIN_API_PORT=3001
CHECKIN_API_PORT=3002
SUPER_ADMIN_API_PORT=3003
```

Para bootstrap local o ambiente de pruebas tambien se usan:

```txt
PLATFORM_BOOTSTRAP_EMAIL=super.admin@crit.test
PLATFORM_BOOTSTRAP_PASSWORD=1234567890ab
BOOTSTRAP_ADMIN_EMAIL=smoke.admin@crit.test
BOOTSTRAP_ADMIN_PASSWORD=1234567890ab
BOOTSTRAP_ADMIN_FULL_NAME=Smoke Admin
```

No subir `.env` al repositorio.

## Local con Docker Compose

Primero levantar `crit-db`, porque el compose de API se une a la red Docker
externa `crit-db_default` y conecta directo al servicio `crit-db:5432`.

Desde `crit-db`:

```bash
docker compose up --build --wait
```

Luego, desde `crit-api`:

```bash
npm install
docker compose up --build
```

Servicios:

```txt
main API        http://localhost:3000/health
admin API       http://localhost:3001/health
check-in API    http://localhost:3002/health
super-admin API http://localhost:3003/health
```

El compose espera que la base de datos ya exista. Para Docker local usa por default:

```txt
API_DATABASE_URL=postgresql://crit_app:crit_app@crit-db:5432/crit_db
API_PLATFORM_DATABASE_URL=postgresql://crit_platform_app:crit_platform_app@crit-db:5432/crit_db
```

No usar `host.docker.internal` para el flujo local con DB en Docker: en Docker
Desktop puede resolver a una IP del host que no acepta conexiones desde los
contenedores y producir `ETIMEDOUT` en login o check-in.

Si la DB vive en otra red o proveedor, exportar esas dos variables antes de
`docker compose up` con el host real de esa DB.

## Render

Crear cuatro servicios Web con el mismo repositorio y Dockerfile. En cada servicio definir el comando:

```txt
node dist/apps/main-api/server.js
node dist/apps/admin-api/server.js
node dist/apps/checkin-api/server.js
node dist/apps/super-admin-api/server.js
```

Configurar el puerto correspondiente en variables de entorno:

```txt
MAIN_API_PORT=3000
ADMIN_API_PORT=3001
CHECKIN_API_PORT=3002
SUPER_ADMIN_API_PORT=3003
```

En Render normalmente cada servicio expone un unico puerto externo. Mantener las URLs finales en el frontend:

```txt
VITE_MAIN_API_URL=https://<main-api>.onrender.com
VITE_ADMIN_API_URL=https://<admin-api>.onrender.com/admin
VITE_CHECKIN_API_URL=https://<checkin-api>.onrender.com/checkin
VITE_SUPER_ADMIN_API_URL=https://<super-admin-api>.onrender.com/platform
```

## Validacion

Antes de desplegar:

```bash
npm run typecheck
npm run build
npm test
docker compose config
docker compose build
```
