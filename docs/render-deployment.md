# Despliegue de prueba en Render

Esta guia sirve para publicar el MVP de CRIT Assist en un ambiente demo para
que varias computadoras puedan probarlo. No usar datos reales de pacientes,
familias ni notas clinicas.

## Arquitectura recomendada

- `crit-db`: Render Postgres administrado. El esquema se aplica desde el repo
  `crit-db` con sus migraciones/seeds.
- `crit-api`: cuatro Web Services de Render usando el mismo repo y Dockerfile.
- `crit-api` worker: un Background Worker opcional para el outbox de POST a la
  API institucional.
- `crit-front`: Static Site de Render, apuntando a las URLs publicas de las APIs.

Render permite crear Web Services para apps Node/Express y Static Sites para
frontends estaticos. Para Postgres, usar la URL interna cuando la API y la DB
esten en la misma cuenta y region.

## 1. Preparar ramas y secretos

1. Subir `dev` actualizado en los tres repos: `crit-db`, `crit-api` y
   `crit-front`.
2. Generar secretos fuertes para:
   - `JWT_SECRET`
   - `PLATFORM_JWT_SECRET`
   - `PLATFORM_BOOTSTRAP_PASSWORD`
   - `BOOTSTRAP_ADMIN_PASSWORD`
   - `DEMO_USER_PASSWORD`
3. Definir una URL final para el frontend, por ejemplo:
   `https://crit-assist-demo.onrender.com`.

No poner estos valores en `.env` versionado ni en commits.

## 2. Crear Postgres

1. En Render: `New > Postgres`.
2. Usar una sola region para DB y servicios, por ejemplo Oregon.
3. Crear la base demo, por ejemplo `crit-assist-demo-db`.
4. Copiar la `Internal Database URL`.

La API necesita dos URLs:

```txt
DATABASE_URL=<internal database url para crit_app>
PLATFORM_DATABASE_URL=<internal database url para crit_platform_app>
```

Si `crit-db` crea roles separados (`crit_app` y `crit_platform_app`), aplicar
sus migraciones/seeds primero desde ese repo contra la base de Render. Para una
prueba rapida tambien se puede usar temporalmente la misma URL con un usuario
con permisos suficientes, pero lo correcto es respetar los roles del repo
`crit-db`.

## 3. Aplicar esquema y seeds desde crit-db

Desde `crit-db`, configurar la conexion hacia la base Render y ejecutar sus
migraciones/seeds segun los scripts de ese repo.

Objetivo minimo antes de levantar `crit-api`:

- Tablas creadas.
- Roles base creados.
- Tenant demo disponible, por ejemplo `CRIT-OCC-01`.
- Usuarios/roles de DB esperados por `crit-api` con permisos correctos.

## 4. Crear servicios de crit-api

Crear cuatro Web Services en Render con el repo `crit-api`.

Usar Docker y el mismo `Dockerfile`. Cambiar solo el Start Command:

```txt
crit-main-api        node dist/apps/main-api/server.js
crit-admin-api       node dist/apps/admin-api/server.js
crit-checkin-api     node dist/apps/checkin-api/server.js
crit-super-admin-api node dist/apps/super-admin-api/server.js
```

Variables comunes en los cuatro servicios:

```txt
NODE_ENV=production
DATABASE_URL=<internal database url>
PLATFORM_DATABASE_URL=<internal platform database url>
JWT_SECRET=<secreto de 32+ caracteres>
JWT_EXPIRES_IN=8h
JWT_ISSUER=crit-api
JWT_AUDIENCE=crit-assist
PLATFORM_JWT_SECRET=<secreto de 32+ caracteres>
PLATFORM_JWT_EXPIRES_IN=4h
PLATFORM_JWT_ISSUER=crit-api-platform
PLATFORM_JWT_AUDIENCE=crit-assist-platform
CORS_ORIGIN=https://crit-assist-demo.onrender.com
CRIT_POST_API_URL=
CRIT_POST_API_TOKEN=
```

Variables de puerto:

```txt
# crit-main-api
MAIN_API_PORT=3000

# crit-admin-api
ADMIN_API_PORT=3001

# crit-checkin-api
CHECKIN_API_PORT=3002

# crit-super-admin-api
SUPER_ADMIN_API_PORT=3003
```

Health checks esperados:

```txt
https://crit-main-api.onrender.com/health
https://crit-admin-api.onrender.com/health
https://crit-checkin-api.onrender.com/health
https://crit-super-admin-api.onrender.com/health
```

## 5. Bootstrap y datos demo

Cuando los servicios ya conectan a DB:

1. Abrir Shell en `crit-main-api` o usar un one-off job equivalente.
2. Ejecutar:

   ```bash
   npm run platform:bootstrap-super-admin
   npm run admin:bootstrap
   npm run demo:seed-smoke
   ```

Variables necesarias para esos comandos:

```txt
PLATFORM_BOOTSTRAP_FULL_NAME=Super Admin CRIT Demo
PLATFORM_BOOTSTRAP_EMAIL=super.admin@crit.test
PLATFORM_BOOTSTRAP_PASSWORD=<secreto>
BOOTSTRAP_ADMIN_TENANT_CODE=CRIT-OCC-01
BOOTSTRAP_ADMIN_FULL_NAME=Andrea Morales Torres
BOOTSTRAP_ADMIN_EMAIL=demo.admin@crit.test
BOOTSTRAP_ADMIN_PASSWORD=<secreto>
DEMO_TENANT_CODE=CRIT-OCC-01
DEMO_USER_PASSWORD=<secreto de 12+ caracteres>
DEMO_YEAR=2026
```

El seed demo crea usuarios, pacientes, clinicas, consultorios, tipos de cita,
citas, asistencias, notas de enlace y notificaciones ficticias. Las citas demo
estan limitadas por codigo al horario `07:00-19:00`.

## 6. Worker opcional

Si quieren probar el outbox hacia la API institucional, crear un Background
Worker con el mismo repo `crit-api` y este comando:

```txt
node dist/workers/crit-post-api.worker.js
```

Configurar:

```txt
CRIT_POST_API_URL=<url institucional o mock>
CRIT_POST_API_TOKEN=<token>
CRIT_POST_API_POLL_INTERVAL_MS=5000
CRIT_POST_API_BATCH_SIZE=10
CRIT_POST_API_MAX_RETRIES=5
```

Para demo sin integracion externa, omitir el worker y dejar `CRIT_POST_API_URL`
y `CRIT_POST_API_TOKEN` vacios.

## 7. Crear crit-front como Static Site

En Render: `New > Static Site`, repo `crit-front`.

Valores tipicos si el frontend usa Vite:

```txt
Build Command: npm ci && npm run build
Publish Directory: dist
```

Variables del frontend:

```txt
VITE_MAIN_API_URL=https://crit-main-api.onrender.com
VITE_ADMIN_API_URL=https://crit-admin-api.onrender.com/admin
VITE_CHECKIN_API_URL=https://crit-checkin-api.onrender.com/checkin
VITE_SUPER_ADMIN_API_URL=https://crit-super-admin-api.onrender.com/super-admin
```

Para React Router u otro router de cliente, configurar rewrite:

```txt
Source: /*
Destination: /index.html
Action: Rewrite
```

## 8. Validacion final

1. Verificar los cuatro `/health`.
2. Abrir el frontend.
3. Entrar con:
   - `demo.admin@crit.test`
   - `demo.recepcion.general@crit.test`
   - `demo.coordinador.norte@crit.test`
   - `demo.medico.norte@crit.test`
   - `demo.terapeuta.sur@crit.test`
4. Usar `DEMO_USER_PASSWORD` como contrasena.
5. Probar calendario, pacientes, citas, check-in, asistencia, nota medica y
   nota de enlace.

Si algo falla, revisar primero variables de entorno, CORS, URL interna de
Postgres y que las migraciones de `crit-db` hayan corrido contra la base demo.
