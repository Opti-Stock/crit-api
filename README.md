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

- Login / logout.
- Asistencias.
- Pacientes.
- Colaboradores.
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
- Roles.
- Permisos.
- Clínicas.
- Cuartos.
- Catálogos administrativos.

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

Se usa `pg` con un pool de conexiones reutilizable.

Configuración:

```txt
src/config/db.ts
```

Las variables de entorno se cargan y validan en `src/config/env.ts`. Importar el pool no abre una conexión; PostgreSQL se contacta cuando un repositorio ejecuta una consulta o solicita una conexión.

## Variables de entorno

Crear `.env` basado en `.env.example`.

```env
NODE_ENV=development

MAIN_API_PORT=3000
ADMIN_API_PORT=3001
CHECKIN_API_PORT=3002

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crit_db

JWT_SECRET=change_me
JWT_EXPIRES_IN=8h

CORS_ORIGIN=http://localhost:5173

CRIT_POST_API_URL=
CRIT_POST_API_TOKEN=
```

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

Nota: `paciente_familia` debe evaluarse antes de activarse como login real. Para MVP puede bastar con recordatorios externos sin portal de paciente.

## Reglas de acceso iniciales

- Médicos y terapeutas pueden registrar asistencia.
- Médicos y terapeutas pueden escribir nota médica.
- Recepción puede ver asistencia, pero no datos clínicos.
- Dirección y admin pueden administrar usuarios y roles.
- Coordinadores pueden gestionar citas y revisar operación de sus clínicas.
- Pacientes/familias solo deberían ver su información si se decide activar portal propio.

## Integración temporal con API CRIT

El sistema guardará datos propios en PostgreSQL y podrá mandar un POST temporal hacia la API del CRIT.

La integración debe manejarse en:

```txt
src/integrations/crit-post-api/
```

Se recomienda usar patrón outbox desde base de datos para no perder información si la API externa falla.

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
