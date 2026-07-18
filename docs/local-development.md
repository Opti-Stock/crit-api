# Levantamiento local completo

Esta es la guía canónica para levantar `crit-db`, `crit-api` y `crit-front`. Ejecuta los pasos desde `C:\Users\<usuario>\apps\crit-project` o sustituye esa ruta por la carpeta donde clonaste los repositorios.

## Requisitos

- Git.
- Docker Desktop con Docker Compose.
- Node.js 24 y npm para el frontend. Node.js 20 o superior funciona para la API.
- Los tres repositorios en la rama `dev` una vez que los PR correspondientes hayan sido mergeados.

## 1. Actualizar repositorios

```powershell
cd C:\Users\<usuario>\apps\crit-project\crit-db
git switch dev
git pull

cd ..\crit-api
git switch dev
git pull

cd ..\crit-front
git switch dev
git pull
```

## 2. Levantar PostgreSQL

```powershell
cd C:\Users\<usuario>\apps\crit-project\crit-db
Copy-Item .env.local.example .env
docker compose up --build --wait
docker compose ps
.\scripts\verify-db.ps1
```

Antes de continuar, `crit-db` debe aparecer como `healthy` y ambos contratos SQL deben pasar. Las contraseñas de `APP_DB_PASSWORD` y `PLATFORM_DB_PASSWORD` deben coincidir con las URLs configuradas en `crit-api`.

## 3. Configurar y preparar la API

```powershell
cd C:\Users\<usuario>\apps\crit-project\crit-api
npm ci
Copy-Item .env.local.example .env
npm run db:check
npm run platform:bootstrap-super-admin
npm run admin:bootstrap
```

Cambia las contraseñas de ejemplo de `.env` antes del bootstrap. No subas ese archivo. Para cargar el escenario ficticio ampliado de la demo:

```powershell
npm run demo:seed-smoke
```

El seed es opcional, usa solamente datos ficticios y no debe ejecutarse en producción.

## 4A. Desarrollo híbrido recomendado

Abre cuatro terminales en `crit-api`:

```powershell
npm run dev:main
```

```powershell
npm run dev:admin
```

```powershell
npm run dev:checkin
```

```powershell
npm run dev:super-admin
```

En una quinta terminal inicia el frontend:

```powershell
cd C:\Users\<usuario>\apps\crit-project\crit-front
npm ci --legacy-peer-deps
Copy-Item .env.local.example .env.local
npm run dev
```

Abre `http://localhost:5173`. Vite enruta automáticamente las cuatro APIs y las cookies funcionan bajo un solo origen.

## 4B. Alternativa: todo en Docker

No ejecutes esta alternativa al mismo tiempo que los procesos `npm run dev:*`.

```powershell
cd C:\Users\<usuario>\apps\crit-project\crit-api
docker compose up --build --wait

cd ..\crit-front
docker compose up --build --wait
```

El compose de API se conecta a la red `crit-db_default`; por eso PostgreSQL debe levantarse primero. El compose del frontend se conecta después a `crit-api_default` y publica Nginx en `http://localhost:5173`.

## 5. Verificación

```powershell
Invoke-RestMethod http://localhost:3000/health/live
Invoke-RestMethod http://localhost:3000/health/ready
Invoke-RestMethod http://localhost:3001/health/ready
Invoke-RestMethod http://localhost:3002/health/ready
Invoke-RestMethod http://localhost:3003/health/ready
Invoke-WebRequest http://localhost:5173/health
```

Después de iniciar sesión como administrador, Swagger está disponible en:

- `http://localhost:5173/api/docs/`
- `http://localhost:5173/admin/docs/`
- `http://localhost:5173/checkin/docs/`
- `http://localhost:5173/super-admin/docs/`

Validación completa por repositorio:

```powershell
cd C:\Users\<usuario>\apps\crit-project\crit-api
npm run lint
npm test
npm run validate:openapi

cd ..\crit-front
npm run lint
npm test
npm run build

cd ..\crit-db
.\scripts\verify-db.ps1
```

## 6. Apagar servicios

Detén primero frontend, luego API y finalmente PostgreSQL:

```powershell
cd C:\Users\<usuario>\apps\crit-project\crit-front
docker compose down

cd ..\crit-api
docker compose down

cd ..\crit-db
docker compose down
```

En modo híbrido, detén las cinco terminales con `Ctrl+C` y después ejecuta únicamente `docker compose down` en `crit-db`.

No uses `docker compose down --volumes` salvo que quieras borrar deliberadamente toda la base local y reconstruir los datos demo desde cero.

## Problemas frecuentes

- `network crit-db_default declared as external`: levanta primero `crit-db`.
- `network crit-api_default declared as external`: levanta primero `crit-api` antes de `crit-front`.
- `password authentication failed`: alinea las contraseñas de `crit-db/.env` con `DATABASE_URL`, `PLATFORM_DATABASE_URL`, `API_DATABASE_URL` y `API_PLATFORM_DATABASE_URL` de `crit-api/.env`.
- `UNTRUSTED_ORIGIN`: confirma que `CORS_ORIGIN=http://localhost:5173` y entra siempre por el frontend en ese puerto.
- Puerto ocupado: detén procesos anteriores con `docker compose down` o cierra la terminal que ejecuta el servidor duplicado.
