# crit-api

Backend del sistema de optimización de asistencias para CRIT.

## Propósito

Este repositorio contiene la API principal, la API administrativa y la API de check-in del sistema.

El backend será un monolito modular usando:

- Node.js.
- Express.
- TypeScript.
- PostgreSQL.
- `pg` para conexión directa a base de datos.

No se usará ORM en la primera versión.

## Arquitectura

```txt
crit-front
  ↓
crit-api
  ├── main-api
  ├── admin-api
  └── checkin-api
  ↓
PostgreSQL
  ↓
POST temporal hacia API CRIT
```

## Apps internas

### Main API

Ubicación:

```txt
src/apps/main-api/
```

Responsable de la operación diaria:

- Login mediante access token.
- Asistencias.
- Pacientes.
- Colaboradores.
- Clínicas y cuartos para lecturas operativas.
- Calendario.
- Notas médicas.
- Notas de enlace.
- Notificaciones.

### Admin API

Ubicación:

```txt
src/apps/admin-api/
```

Responsable de administración:

- Usuarios.
- Asignación del catálogo fijo de roles.
- Acceso de usuarios a clínicas.

### Check-in API

Ubicación:

```txt
src/apps/checkin-api/
```

Responsable del flujo de check-in. En esta etapa solo expone health check.

## Estructura

```txt
crit-api/
├── src/
│   ├── apps/
│   │   ├── main-api/
│   │   ├── admin-api/
│   │   └── checkin-api/
│   ├── config/
│   ├── modules/
│   ├── integrations/
│   ├── middlewares/
│   ├── shared/
│   ├── utils/
│   └── types/
├── docs/
├── tests/
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

## Módulos iniciales

```txt
auth
users
roles
patients
collaborators
clinics
rooms
appointments
attendance
medical-notes
handoff-notes
calendar
notifications
admin
```

## Patrón por módulo

Cada módulo debe seguir esta separación:

```txt
routes -> controller -> service -> repository -> PostgreSQL
```

Ejemplo futuro:

```txt
attendance/
├── attendance.routes.ts
├── attendance.controller.ts
├── attendance.service.ts
├── attendance.repository.ts
├── attendance.validation.ts
├── attendance.constants.ts
└── README.md
```

## Conexión a PostgreSQL

Se usa `pg` con un pool de conexiones reutilizable y el rol PostgreSQL no propietario `crit_app`.

Configuración:

```txt
src/config/db.ts
```

Las variables de entorno se cargan y validan en `src/config/env.ts`. Importar el pool no abre una conexión; PostgreSQL se contacta cuando un repositorio ejecuta una consulta o solicita una conexión.

Validar la conexión y la baseline:

```bash
npm run db:check
```

Cada operación tenant-scoped usa una transacción y establece `app.current_tenant_id` y `app.current_user_id` con `set_config(..., true)`. Las queries conservan además un filtro `tenant_id` explícito. Ver `docs/crit-api-integration.md`.

## Variables de entorno

Crear `.env` basado en `.env.example`.

```env
NODE_ENV=development

MAIN_API_PORT=3000
ADMIN_API_PORT=3001
CHECKIN_API_PORT=3002

DATABASE_URL=postgresql://crit_app:crit_app@localhost:5432/crit_db

JWT_SECRET=replace_with_at_least_32_characters
JWT_EXPIRES_IN=8h
JWT_ISSUER=crit-api
JWT_AUDIENCE=crit-assist
BCRYPT_SALT_ROUNDS=12

BOOTSTRAP_ADMIN_TENANT_CODE=CRIT-OCC-01
BOOTSTRAP_ADMIN_FULL_NAME=Local Admin
BOOTSTRAP_ADMIN_EMAIL=admin.local@crit.test
BOOTSTRAP_ADMIN_PASSWORD=

CORS_ORIGIN=http://localhost:5173

CRIT_POST_API_URL=
CRIT_POST_API_TOKEN=
```

Create the first local administrator and validate M1 with:

```bash
npm run admin:bootstrap
npm run test:integration
```

Bootstrap credentials are local-only and must never be committed. The command is
idempotent for the configured administrator.

Para preparar un centro adicional y crear su primer administrador, seguir
[`docs/tenant-onboarding.md`](docs/tenant-onboarding.md).

## Roles iniciales

```txt
admin
direccion
recepcion
coordinador
medico
terapeuta
personal_acompanamiento
paciente_familia
```

Nota: `paciente_familia` está reservado y no se asigna durante el MVP. El login futuro recibe `{ tenantCode, email, password }` y el JWT conserva `userId`, `tenantId` y roles.

## Reglas de acceso iniciales

- Médicos y terapeutas pueden registrar asistencia.
- Médicos y terapeutas pueden escribir nota médica.
- Recepción puede ver asistencia, pero no datos clínicos.
- Dirección y admin pueden administrar usuarios y roles, pero no obtienen acceso clínico automático.
- Coordinadores pueden gestionar citas y revisar operación de sus clínicas.
- Pacientes/familias solo deberían ver su información si se decide activar portal propio.

## Integración temporal con API CRIT

El sistema guardará datos propios en PostgreSQL y podrá mandar un POST temporal hacia la API del CRIT.

La integración debe manejarse en:

```txt
src/integrations/crit-post-api/
```

La mutación de negocio y `crit_api_outbox` se escriben en la misma transacción para no perder información si la API externa falla.

## Convención de ramas

```txt
main
dev
feat/OPT-00-descripcion
fix/OPT-00-descripcion
chore/OPT-00-descripcion
docs/OPT-00-descripcion
refactor/OPT-00-descripcion
```

## Responsables

Backend:

- Alan.
- Esteban.
