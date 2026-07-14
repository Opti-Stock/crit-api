# Guia paso a paso: demo en Render

Esta guia publica el MVP de CRIT Assist para que se pueda probar desde varias
computadoras. No uses datos reales de pacientes, familiares, notas clinicas,
telefonos ni correos reales.

## Resultado esperado

Al terminar tendras:

- 1 base PostgreSQL en Render.
- 4 Web Services de `crit-api`:
  - `crit-main-api`
  - `crit-admin-api`
  - `crit-checkin-api`
  - `crit-super-admin-api`
- 1 Static Site de `crit-front`.
- Datos demo ficticios con usuarios, pacientes, clinicas, citas, check-in,
  asistencias, notas de enlace y notificaciones.

## Valores que usaremos

Puedes cambiar nombres si quieres, pero esta guia asume estos valores:

```txt
Frontend URL: https://crit-assist-demo.onrender.com
Main API:     https://crit-main-api.onrender.com
Admin API:    https://crit-admin-api.onrender.com
Check-in API: https://crit-checkin-api.onrender.com
Super Admin:  https://crit-super-admin-api.onrender.com
Tenant demo:  CRIT-OCC-01
```

`CORS_ORIGIN` debe aceptar el frontend de Render y tu frontend local:

```txt
CORS_ORIGIN=https://crit-assist-demo.onrender.com,http://localhost:5173
```

## 0. Antes de abrir Render

En tu computadora, abre PowerShell.

Verifica que los tres repos esten en `dev` y actualizados:

```powershell
cd C:\Users\esteb\apps\crit-project\crit-db
git switch dev
git pull
git push origin dev

cd C:\Users\esteb\apps\crit-project\crit-api
git switch dev
git pull
git push origin dev

cd C:\Users\esteb\apps\crit-project\crit-front
git switch dev
git pull
git push origin dev
```

En `crit-api`, tu `.env` local debe tener secretos fuertes. No los subas a Git.
Si necesitas revisar que existan sin imprimirlos:

```powershell
cd C:\Users\esteb\apps\crit-project\crit-api
Select-String .env -Pattern "JWT_SECRET|PLATFORM_JWT_SECRET|PLATFORM_BOOTSTRAP_PASSWORD|BOOTSTRAP_ADMIN_PASSWORD|DEMO_USER_PASSWORD|CORS_ORIGIN"
```

## 1. Crear la base PostgreSQL en Render

1. Entra a [Render](https://dashboard.render.com/).
2. En la barra lateral o arriba, da click en `New`.
3. Da click en `Postgres`.
4. Llena el formulario:
   - `Name`: `crit-assist-demo-db`
   - `Database`: `crit_db`
   - `User`: deja el default de Render.
   - `Region`: elige una sola region y usa la misma para todo, por ejemplo
     `Oregon`.
   - `PostgreSQL Version`: usa la version disponible mas cercana a 16.
   - `Plan`: para pruebas, el plan mas pequeno disponible.
5. Da click en `Create Database`.
6. Espera a que el estado diga `Available`.
7. En la pagina de la base, abre la pestana `Connect`.
8. Copia y guarda estos dos valores:
   - `Internal Database URL`
   - `External Database URL`

Usaremos:

- `External Database URL` para inicializar la base desde tu computadora.
- `Internal Database URL` para las variables de Render de las APIs.

## 2. Crear usuarios de DB, migraciones y seeds desde crit-db

Este paso usa Docker local para correr `psql`, asi no necesitas instalar
PostgreSQL en Windows.

En PowerShell:

```powershell
cd C:\Users\esteb\apps\crit-project\crit-db
```

Pega estos valores. Sustituye `RENDER_EXTERNAL_DATABASE_URL_AQUI` por el
`External Database URL` que copiaste de Render.

Usa passwords fuertes para `APP_DB_PASSWORD` y `PLATFORM_DB_PASSWORD`. Puedes
usar los mismos secretos fuertes que guardaste localmente o generar otros.

```powershell
$env:RENDER_DATABASE_URL="RENDER_EXTERNAL_DATABASE_URL_AQUI"
$env:APP_DB_USER="crit_app"
$env:APP_DB_PASSWORD="CAMBIA_ESTE_PASSWORD_APP_DB"
$env:PLATFORM_DB_USER="crit_platform_app"
$env:PLATFORM_DB_PASSWORD="CAMBIA_ESTE_PASSWORD_PLATFORM_DB"
```

Ahora ejecuta este comando completo:

```powershell
docker run --rm `
  -e RENDER_DATABASE_URL `
  -e APP_DB_USER `
  -e APP_DB_PASSWORD `
  -e PLATFORM_DB_USER `
  -e PLATFORM_DB_PASSWORD `
  -v "${PWD}:/work" `
  -w /work `
  postgres:16 `
  sh -lc '
set -Eeuo pipefail

psql "$RENDER_DATABASE_URL" --set ON_ERROR_STOP=1 \
  --set app_db_user="$APP_DB_USER" \
  --set app_db_password="$APP_DB_PASSWORD" <<'"'"'SQL'"'"'
SELECT format(
    '"'"'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT'"'"',
    :'"'"'app_db_user'"'"',
    :'"'"'app_db_password'"'"'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'"'"'app_db_user'"'"')
\gexec
SQL

psql "$RENDER_DATABASE_URL" --set ON_ERROR_STOP=1 \
  --set platform_db_user="$PLATFORM_DB_USER" \
  --set platform_db_password="$PLATFORM_DB_PASSWORD" <<'"'"'SQL'"'"'
SELECT format(
    '"'"'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT'"'"',
    :'"'"'platform_db_user'"'"',
    :'"'"'platform_db_password'"'"'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'"'"'platform_db_user'"'"')
\gexec
SQL

for migration in migrations/*.sql; do
  echo "Applying ${migration}"
  psql "$RENDER_DATABASE_URL" --set ON_ERROR_STOP=1 --file "$migration"
done

psql "$RENDER_DATABASE_URL" --set ON_ERROR_STOP=1 --file seeds/002_seed_tenant_crit_occidente.sql
psql "$RENDER_DATABASE_URL" --set ON_ERROR_STOP=1 --file seeds/001_seed_roles.sql

psql "$RENDER_DATABASE_URL" --set ON_ERROR_STOP=1 \
  --set app_db_user="$APP_DB_USER" <<'"'"'SQL'"'"'
SELECT format('"'"'GRANT USAGE ON SCHEMA public TO %I'"'"', :'"'"'app_db_user'"'"')
\gexec

SELECT format('"'"'GRANT SELECT ON TABLE public.%I TO %I'"'"', table_name, :'"'"'app_db_user'"'"')
FROM (VALUES ('"'"'tenants'"'"'), ('"'"'audit_logs'"'"')) AS read_tables(table_name)
\gexec

SELECT format(
    '"'"'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO %I'"'"',
    tablename,
    :'"'"'app_db_user'"'"'
)
FROM pg_tables
WHERE schemaname = '"'"'public'"'"'
  AND tablename NOT IN ('"'"'tenants'"'"', '"'"'audit_logs'"'"', '"'"'platform_super_admins'"'"', '"'"'platform_audit_logs'"'"')
\gexec

SELECT format('"'"'GRANT EXECUTE ON FUNCTION public.current_app_tenant_id() TO %I'"'"', :'"'"'app_db_user'"'"')
UNION ALL
SELECT format('"'"'GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO %I'"'"', :'"'"'app_db_user'"'"')
\gexec
SQL

psql "$RENDER_DATABASE_URL" --set ON_ERROR_STOP=1 \
  --set platform_db_user="$PLATFORM_DB_USER" <<'"'"'SQL'"'"'
SELECT format('"'"'GRANT USAGE ON SCHEMA public TO %I'"'"', :'"'"'platform_db_user'"'"')
\gexec

SELECT format('"'"'GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO %I'"'"', table_name, :'"'"'platform_db_user'"'"')
FROM (VALUES ('"'"'tenants'"'"'), ('"'"'platform_super_admins'"'"')) AS writable_platform_tables(table_name)
\gexec

SELECT format('"'"'GRANT SELECT, INSERT ON TABLE public.platform_audit_logs TO %I'"'"', :'"'"'platform_db_user'"'"')
\gexec

SELECT format('"'"'GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO %I'"'"', table_name, :'"'"'platform_db_user'"'"')
FROM (VALUES ('"'"'roles'"'"'), ('"'"'users'"'"')) AS tenant_provisioning_tables(table_name)
\gexec

SELECT format('"'"'GRANT SELECT, INSERT, DELETE ON TABLE public.%I TO %I'"'"', table_name, :'"'"'platform_db_user'"'"')
FROM (VALUES ('"'"'user_roles'"'"'), ('"'"'user_clinic_access'"'"')) AS tenant_assignment_tables(table_name)
\gexec

SELECT format('"'"'GRANT SELECT ON TABLE public.%I TO %I'"'"', table_name, :'"'"'platform_db_user'"'"')
FROM (
    VALUES
        ('"'"'patients'"'"'),
        ('"'"'collaborators'"'"'),
        ('"'"'clinics'"'"'),
        ('"'"'rooms'"'"'),
        ('"'"'collaborator_clinics'"'"'),
        ('"'"'appointment_types'"'"'),
        ('"'"'collaborator_availability'"'"'),
        ('"'"'appointments'"'"'),
        ('"'"'appointment_check_ins'"'"'),
        ('"'"'attendance_records'"'"'),
        ('"'"'notifications'"'"')
) AS operational_summary_tables(table_name)
\gexec

SELECT format('"'"'GRANT EXECUTE ON FUNCTION public.current_app_tenant_id() TO %I'"'"', :'"'"'platform_db_user'"'"')
UNION ALL
SELECT format('"'"'GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO %I'"'"', :'"'"'platform_db_user'"'"')
\gexec
SQL
'
```

Cuando termine sin errores, la base ya tiene tablas, tenant demo y roles.

## 3. Preparar URLs de conexion para crit-api

Render te da una `Internal Database URL` con el usuario propietario de Render.
Para la API necesitamos cambiar el usuario/password por los roles que acabas de
crear.

Si tu `Internal Database URL` se ve asi:

```txt
postgresql://render_owner:owner_password@dpg-xxxx-a.oregon-postgres.render.com/crit_db
```

Entonces define estas URLs para los servicios:

```txt
DATABASE_URL=postgresql://crit_app:APP_DB_PASSWORD@dpg-xxxx-a.oregon-postgres.render.com/crit_db
PLATFORM_DATABASE_URL=postgresql://crit_platform_app:PLATFORM_DB_PASSWORD@dpg-xxxx-a.oregon-postgres.render.com/crit_db
```

Reemplaza:

- `APP_DB_PASSWORD` por el valor de `$env:APP_DB_PASSWORD`.
- `PLATFORM_DB_PASSWORD` por el valor de `$env:PLATFORM_DB_PASSWORD`.
- El host y database por los de tu `Internal Database URL`.

## 4. Crear crit-main-api

1. En Render, da click en `New`.
2. Da click en `Web Service`.
3. En `Source Code`, conecta GitHub si Render lo pide.
4. Busca el repo `Opti-Stock/crit-api`.
5. Da click en `Connect`.
6. Llena:
   - `Name`: `crit-main-api`
   - `Region`: la misma region de la base.
   - `Branch`: `dev`
   - `Root Directory`: dejar vacio.
   - `Runtime`: `Docker`.
   - `Dockerfile Path`: `./Dockerfile`
   - `Docker Context Directory`: `.`
   - `Instance Type`: el plan pequeno para demo.
7. En `Advanced`, busca `Start Command` y escribe:

   ```txt
   node dist/apps/main-api/server.js
   ```

8. En `Environment Variables`, agrega:

   ```txt
   NODE_ENV=production
   MAIN_API_PORT=3000
   DATABASE_URL=<tu DATABASE_URL interna con crit_app>
   PLATFORM_DATABASE_URL=<tu PLATFORM_DATABASE_URL interna con crit_platform_app>
   JWT_SECRET=<tu JWT_SECRET fuerte>
   JWT_EXPIRES_IN=8h
   JWT_ISSUER=crit-api
   JWT_AUDIENCE=crit-assist
   PLATFORM_JWT_SECRET=<tu PLATFORM_JWT_SECRET fuerte>
   PLATFORM_JWT_EXPIRES_IN=4h
   PLATFORM_JWT_ISSUER=crit-api-platform
   PLATFORM_JWT_AUDIENCE=crit-assist-platform
   BCRYPT_SALT_ROUNDS=12
   CORS_ORIGIN=https://crit-assist-demo.onrender.com,http://localhost:5173
   CRIT_POST_API_URL=
   CRIT_POST_API_TOKEN=
   CRIT_POST_API_POLL_INTERVAL_MS=5000
   CRIT_POST_API_BATCH_SIZE=10
   CRIT_POST_API_MAX_RETRIES=5
   CRIT_POST_API_REQUEST_TIMEOUT_MS=10000
   CRIT_POST_API_PROCESSING_TIMEOUT_MS=60000
   PLATFORM_BOOTSTRAP_FULL_NAME=Super Admin CRIT Demo
   PLATFORM_BOOTSTRAP_EMAIL=super.admin@crit.test
   PLATFORM_BOOTSTRAP_PASSWORD=<tu PLATFORM_BOOTSTRAP_PASSWORD fuerte>
   BOOTSTRAP_ADMIN_TENANT_CODE=CRIT-OCC-01
   BOOTSTRAP_ADMIN_FULL_NAME=Andrea Morales Torres
   BOOTSTRAP_ADMIN_EMAIL=demo.admin@crit.test
   BOOTSTRAP_ADMIN_PASSWORD=<tu BOOTSTRAP_ADMIN_PASSWORD fuerte>
   DEMO_TENANT_CODE=CRIT-OCC-01
   DEMO_USER_PASSWORD=<tu DEMO_USER_PASSWORD fuerte>
   DEMO_YEAR=2026
   ```

9. Da click en `Create Web Service`.
10. Espera a que termine el deploy.
11. Abre:

    ```txt
    https://crit-main-api.onrender.com/health
    ```

12. Debe responder:

    ```json
    {"status":"ok","service":"main-api"}
    ```

## 5. Crear crit-admin-api

Repite `New > Web Service > Opti-Stock/crit-api > Connect`.

Usa los mismos valores que `crit-main-api`, con estos cambios:

```txt
Name=crit-admin-api
Start Command=node dist/apps/admin-api/server.js
ADMIN_API_PORT=3001
```

Mantén las mismas variables comunes (`DATABASE_URL`, `JWT_SECRET`,
`CORS_ORIGIN`, etc.).

Cuando termine, verifica:

```txt
https://crit-admin-api.onrender.com/health
```

Debe responder:

```json
{"status":"ok","service":"admin-api"}
```

## 6. Crear crit-checkin-api

Repite `New > Web Service > Opti-Stock/crit-api > Connect`.

Usa:

```txt
Name=crit-checkin-api
Start Command=node dist/apps/checkin-api/server.js
CHECKIN_API_PORT=3002
```

Mantén las mismas variables comunes.

Verifica:

```txt
https://crit-checkin-api.onrender.com/health
```

Debe responder:

```json
{"status":"ok","service":"checkin-api"}
```

## 7. Crear crit-super-admin-api

Repite `New > Web Service > Opti-Stock/crit-api > Connect`.

Usa:

```txt
Name=crit-super-admin-api
Start Command=node dist/apps/super-admin-api/server.js
SUPER_ADMIN_API_PORT=3003
```

Mantén las mismas variables comunes.

Verifica:

```txt
https://crit-super-admin-api.onrender.com/health
```

Debe responder:

```json
{"status":"ok","service":"super-admin-api"}
```

## 8. Crear super admin, admin tenant y datos demo

En Render:

1. Abre el servicio `crit-main-api`.
2. En el menu lateral del servicio, da click en `Shell`.
3. Espera a que aparezca la terminal.
4. Ejecuta:

   ```bash
   npm run platform:bootstrap-super-admin
   ```

5. Ejecuta:

   ```bash
   npm run admin:bootstrap
   ```

6. Ejecuta:

   ```bash
   npm run demo:seed-smoke
   ```

El seed demo es idempotente. Si necesitas correrlo otra vez, puedes repetir
`npm run demo:seed-smoke`.

## 9. Crear crit-front como Static Site

1. En Render, da click en `New`.
2. Da click en `Static Site`.
3. Busca el repo `Opti-Stock/crit-front`.
4. Da click en `Connect`.
5. Llena:
   - `Name`: `crit-assist-demo`
   - `Branch`: `dev`
   - `Root Directory`: dejar vacio.
   - `Build Command`: `npm ci && npm run build`
   - `Publish Directory`: `dist`
6. En `Environment Variables`, agrega:

   ```txt
   VITE_MAIN_API_URL=https://crit-main-api.onrender.com/api
   VITE_ADMIN_API_URL=https://crit-admin-api.onrender.com/admin
   VITE_CHECKIN_API_URL=https://crit-checkin-api.onrender.com/checkin
   VITE_SUPER_ADMIN_API_URL=https://crit-super-admin-api.onrender.com/super-admin
   VITE_APP_NAME=CRIT Assistance
   VITE_AUTH_BYPASS_ENABLED=false
   VITE_USE_ADMIN_MOCKS=false
   ```

7. Da click en `Create Static Site`.
8. Espera a que termine el deploy.
9. Abre:

   ```txt
   https://crit-assist-demo.onrender.com
   ```

## 10. Configurar rewrites del frontend

En el servicio `crit-assist-demo`:

1. En el menu lateral, da click en `Redirects/Rewrites`.
2. Da click en `Add Rule`.
3. Agrega:

   ```txt
   Source: /*
   Destination: /index.html
   Action: Rewrite
   ```

4. Da click en `Save Changes`.

Si Render te pide redeploy, da click en `Manual Deploy > Deploy latest commit`.

## 11. Probar cuentas demo

Abre:

```txt
https://crit-assist-demo.onrender.com
```

Prueba login con estos correos. La password es el valor de `DEMO_USER_PASSWORD`.

```txt
demo.admin@crit.test
demo.recepcion.general@crit.test
demo.coordinador.norte@crit.test
demo.medico.norte@crit.test
demo.terapeuta.sur@crit.test
```

Para super admin, abre:

```txt
https://crit-assist-demo.onrender.com/super-admin.html
```

Usa:

```txt
super.admin@crit.test
```

La password es el valor de `PLATFORM_BOOTSTRAP_PASSWORD`.

## 12. Checklist de validacion

Marca cada punto:

```txt
[ ] https://crit-main-api.onrender.com/health responde main-api
[ ] https://crit-admin-api.onrender.com/health responde admin-api
[ ] https://crit-checkin-api.onrender.com/health responde checkin-api
[ ] https://crit-super-admin-api.onrender.com/health responde super-admin-api
[ ] Frontend abre en https://crit-assist-demo.onrender.com
[ ] Login admin funciona
[ ] Calendario muestra citas demo
[ ] Pacientes muestra nombres demo
[ ] Check-in funciona con recepcion
[ ] Asistencia funciona con medico o terapeuta
[ ] Nota medica no se muestra a recepcion
[ ] Nota de enlace aparece en notificaciones
```

## 13. Si algo falla

### La API no levanta

En Render:

1. Abre el servicio que falla.
2. Da click en `Logs`.
3. Busca errores como:
   - `Invalid environment configuration`
   - `password authentication failed`
   - `relation does not exist`

Soluciones comunes:

- `Invalid environment configuration`: falta una variable o una URL esta mal.
- `password authentication failed`: revisa `DATABASE_URL` o
  `PLATFORM_DATABASE_URL`.
- `relation does not exist`: no corriste migraciones de `crit-db` contra la DB
  de Render.

### El frontend abre pero login falla por CORS

Revisa que los cuatro servicios de API tengan:

```txt
CORS_ORIGIN=https://crit-assist-demo.onrender.com,http://localhost:5173
```

Luego en cada servicio da click en:

```txt
Manual Deploy > Deploy latest commit
```

### El frontend local deja de funcionar

El frontend local usa:

```txt
http://localhost:5173
```

Por eso `CORS_ORIGIN` debe incluirlo junto con Render:

```txt
https://crit-assist-demo.onrender.com,http://localhost:5173
```

### No ves datos demo

En `crit-main-api > Shell`, corre otra vez:

```bash
npm run demo:seed-smoke
```

Luego recarga el frontend.

## 14. Worker opcional del outbox

Para demo sin API institucional externa, omite este paso.

Si quieren probar el POST institucional:

1. En Render da click en `New`.
2. Da click en `Background Worker`.
3. Conecta `Opti-Stock/crit-api`.
4. Llena:
   - `Name`: `crit-post-api-worker`
   - `Branch`: `dev`
   - `Runtime`: `Docker`
   - `Start Command`: `node dist/workers/crit-post-api.worker.js`
5. Usa las mismas variables comunes que las APIs.
6. Agrega:

   ```txt
   CRIT_POST_API_URL=<url institucional o mock>
   CRIT_POST_API_TOKEN=<token institucional o mock>
   ```

7. Da click en `Create Background Worker`.
