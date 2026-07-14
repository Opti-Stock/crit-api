# crit-api

Backend de CRIT Assist para autenticacion, operacion diaria, administracion e
integracion temporal con la API institucional del CRIT.

## Arquitectura

- Node.js, Express 5 y TypeScript.
- PostgreSQL mediante `pg`, sin ORM.
- Monolito modular con separacion `routes -> controller -> service -> repository`.
- `main-api`: autenticacion y operacion diaria, puerto `3000`.
- `admin-api`: usuarios, roles y accesos a clinicas, puerto `3001`.
- `checkin-api`: check-in autenticado de recepcion, puerto `3002`.
- `super-admin-api`: administracion global multi-CRIT, puerto `3003`.
- Worker independiente para el POST temporal hacia la API CRIT.

`crit-db` es la unica fuente de verdad para esquema, migraciones y seeds. Esta
API no crea tablas ni ejecuta DDL al iniciar.

## Requisitos

- Node.js 20 o posterior.
- npm.
- Docker Desktop para ejecutar `crit-db` localmente.
- El repositorio hermano `crit-db` con su rama `dev` actualizada.

## Preparacion local

1. Levantar PostgreSQL desde `crit-db`:

   ```powershell
   cd ..\crit-db
   docker compose up -d
   docker compose ps
   cd ..\crit-api
   ```

2. Instalar dependencias y crear la configuracion local:

   ```powershell
   npm install
   Copy-Item .env.example .env
   ```

3. Sustituir en `.env` los placeholders de `JWT_SECRET`,
   `PLATFORM_JWT_SECRET`, `PLATFORM_BOOTSTRAP_PASSWORD` y
   `BOOTSTRAP_ADMIN_PASSWORD`. Usar valores locales fuertes; `.env` esta
   ignorado por Git y nunca debe agregarse al repositorio.

4. Verificar la conexion y crear el primer administrador local:

   ```powershell
   npm run db:check
   npm run platform:bootstrap-super-admin
   npm run admin:bootstrap
   ```

El bootstrap es idempotente para el correo configurado. Las instrucciones para
crear otro centro y su primer administrador estan en
[`docs/tenant-onboarding.md`](docs/tenant-onboarding.md).

## Variables de entorno

Las variables completas y sus defaults viven en `.env.example`.

| Grupo | Variables |
| --- | --- |
| Apps | `NODE_ENV`, `MAIN_API_PORT`, `ADMIN_API_PORT`, `CHECKIN_API_PORT`, `SUPER_ADMIN_API_PORT`, `CORS_ORIGIN` |
| PostgreSQL | `DATABASE_URL` con `crit_app`, `PLATFORM_DATABASE_URL` con `crit_platform_app` |
| JWT | `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_ISSUER`, `JWT_AUDIENCE`, `PLATFORM_JWT_*` |
| Passwords | `BCRYPT_SALT_ROUNDS` |
| Bootstrap | `PLATFORM_BOOTSTRAP_*`, `BOOTSTRAP_ADMIN_TENANT_CODE`, `BOOTSTRAP_ADMIN_FULL_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` |
| API CRIT | `CRIT_POST_API_URL`, `CRIT_POST_API_TOKEN` y opciones `CRIT_POST_API_*` del worker |

La URL y el token de la API CRIT pueden quedar vacios para levantar las APIs.
Son obligatorios solamente al iniciar el worker.

`CORS_ORIGIN` tiene default local `http://localhost:5173` y acepta una o mas
URLs separadas por coma, por ejemplo
`http://localhost:5173,https://crit-assist-demo.onrender.com`. Las apps solo
responden con headers CORS para esos origenes permitidos.

## Ejecutar las aplicaciones

Abrir una terminal por proceso:

```powershell
npm run dev:main
npm run dev:admin
npm run dev:checkin
npm run dev:super-admin
```

Health checks:

```txt
GET http://localhost:3000/health
GET http://localhost:3001/health
GET http://localhost:3002/health
GET http://localhost:3003/health
```

Las rutas operativas estan bajo `http://localhost:3000/api`; las rutas
administrativas, bajo `http://localhost:3001/admin`; check-in, bajo
`http://localhost:3002/checkin`; y super admin, bajo
`http://localhost:3003/super-admin`.

## Autenticacion y tenant

El login recibe email y password:

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin.local@crit.test",
  "password": "local-password"
}
```

La API resuelve internamente el tenant a partir de un email activo y unico en un
tenant activo. Si el email es ambiguo entre tenants, el login responde el mismo
`401` generico que una contrasena incorrecta. El access token contiene `userId`,
`tenantId` y todos los roles activos. Las rutas protegidas usan
`Authorization: Bearer <token>`. Nunca se acepta un `tenantId` enviado por body,
query o `x-tenant-id` como fuente de autorizacion.

Un usuario puede tener varios roles. Los permisos de ruta usan semantica OR y
los alcances operativos compatibles se combinan. Los cambios de roles requieren
un nuevo login; el token anterior conserva sus claims hasta expirar.

Consulta [`docs/auth-and-roles.md`](docs/auth-and-roles.md) para el contrato
completo de RBAC.

## Super admin global

El super admin usa una API y un token separados del tenant:

```http
POST /super-admin/auth/login
Content-Type: application/json

{
  "email": "platform.admin@crit.test",
  "password": "local-platform-password"
}
```

Endpoints principales:

- `GET /super-admin/tenants`
- `POST /super-admin/tenants`
- `GET|PATCH /super-admin/tenants/:tenantId`
- `POST /super-admin/tenants/:tenantId/admin-users`

El super admin puede crear CRITs y el primer admin de cada CRIT. No tiene
endpoints ni permisos de base de datos para leer contenido de notas medicas.

## Check-in API

`checkin-api` usa el mismo JWT de usuarios tenant-scoped y acepta roles
`recepcion`, `admin` y `direccion`.

- `GET /checkin/appointments?date=YYYY-MM-DD&clinicId=<uuid>&search=<text>`
- `GET /checkin/appointments/:appointmentId`
- `POST /checkin/appointments/:appointmentId/check-in`

El check-in registra asistencia `present` o `late`, no expone contenido clinico
y respeta el acceso por clinica de recepcion.

## Flujo operativo local

1. Levantar `crit-db`, ejecutar bootstrap e iniciar `main-api` y `admin-api`.
2. Obtener un token mediante `POST /api/auth/login`.
3. Comprobarlo con `GET /api/auth/me`.
4. Consultar pacientes, colaboradores, clinicas, cuartos y tipos de cita.
5. Crear una cita con `POST /api/appointments` usando un usuario autorizado.
6. Registrar asistencia con `POST /api/attendance` usando un usuario con rol
   `medico` o `terapeuta` vinculado al colaborador de la cita.
7. Ejecutar `npm run worker:crit-post-api:once` para procesar el outbox.

Una base nueva incluye tenant y roles, pero no un catalogo operativo completo.
Los pasos 4 a 6 requieren pacientes, clinicas, cuartos, tipos de cita y un
colaborador clinico previamente aprovisionados. La validacion automatizada
`npm run test:outbox-integration` crea y elimina sus filas operativas ficticias;
los audit logs generados permanecen por diseno, sin valores clinicos.

## Worker de integracion CRIT

Registrar asistencia guarda el evento `attendance.registered` en
`crit_api_outbox` dentro de la misma transaccion. El POST ocurre despues, por lo
que una falla institucional no revierte la asistencia.

```powershell
# Proceso continuo
npm run worker:crit-post-api

# Un lote y salida
npm run worker:crit-post-api:once
```

El payload es provisional y versionado. Solo contiene identificadores y estado
operativo; no incluye nombres, contacto, notas medicas ni contenido clinico.
Detalles en [`docs/crit-api-integration.md`](docs/crit-api-integration.md).

## Despliegue demo

Para publicar el MVP en Render con `crit-db`, los servicios de `crit-api`, el
worker opcional y `crit-front`, usar la guia en
[`docs/render-deployment.md`](docs/render-deployment.md).

## Validaciones

```powershell
npm run build
npm test
npm run db:check
npm run test:integration
npm run test:outbox-integration
```

- `build` valida TypeScript sin generar archivos.
- `test` ejecuta las pruebas unitarias con `node:test` mediante `tsx`.
- `db:check` verifica conexion y la baseline de `crit-db`.
- `test:integration` valida login y administracion usando el admin previamente
  creado; requiere las variables `BOOTSTRAP_ADMIN_*`.
- `test:outbox-integration` valida atomicidad, envio, error, reintento,
  recuperacion y concurrencia usando datos ficticios; requiere el tenant y el
  admin configurados por `admin:bootstrap`.
- `npm run lint` sigue siendo un placeholder y no valida codigo todavia.

## Convencion de ramas

Trabajar desde `dev` con ramas `feat/OPT-00-description`,
`fix/OPT-00-description`, `docs/OPT-00-description` o equivalentes. No incluir
secrets, `.env`, credenciales ni datos reales de pacientes en commits.
