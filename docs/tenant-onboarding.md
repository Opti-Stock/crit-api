# Alta de un tenant y su primer administrador

Esta guia describe el handoff entre `crit-db` y `crit-api` para habilitar un
nuevo centro. Es un procedimiento operativo controlado; no existe un endpoint
publico para crear tenants.

## Responsabilidades por repositorio

`crit-db` debe dejar preparado:

- Un registro activo en `tenants` con un `code` unico.
- El catalogo inicial de roles asociado al nuevo `tenant_id`, incluido `admin`.
- Permisos y politicas RLS compatibles con el rol PostgreSQL `crit_app`.
- Una verificacion que confirme que el tenant y sus roles existen.

`crit-api` se encarga despues de:

- Crear el primer usuario administrador con una contrasena hasheada.
- Asociarlo al mismo `tenant_id` y al rol `admin` en una transaccion.
- Permitir que ese administrador cree los usuarios posteriores desde
  `admin-api`.

No se deben insertar usuarios ni hashes de contrasena mediante seeds de
`crit-db`.

## Precondiciones

1. Las migraciones de `crit-db` estan aplicadas.
2. PostgreSQL esta disponible para `crit_app`.
3. El tenant nuevo esta activo y tiene todos los roles iniciales.
4. No existe todavia otro administrador activo en ese tenant.
5. El archivo local `.env` de `crit-api` existe y no esta versionado.

Ejemplo de datos preparados por `crit-db`:

```txt
tenant code: CRIT-NORTE-01
roles: admin, direccion, recepcion, coordinador, medico, terapeuta,
       personal_acompanamiento, paciente_familia
```

## Configurar el bootstrap

Configurar en el `.env` local de `crit-api`:

```dotenv
DATABASE_URL=postgresql://crit_app:crit_app@127.0.0.1:5432/crit_db
BCRYPT_SALT_ROUNDS=12

BOOTSTRAP_ADMIN_TENANT_CODE=CRIT-NORTE-01
BOOTSTRAP_ADMIN_FULL_NAME=Administrador CRIT Norte
BOOTSTRAP_ADMIN_EMAIL=admin.norte@crit.example
BOOTSTRAP_ADMIN_PASSWORD=una-contrasena-temporal-segura
```

La contrasena debe tener entre 12 y 72 caracteres. No colocar credenciales
reales en `.env.example`, documentacion, commits, logs o mensajes de PR.

## Ejecutar

Desde `crit-api`:

```bash
npm run db:check
npm run admin:bootstrap
```

El resultado esperado la primera vez es:

```txt
Local admin created
```

Ejecutar el comando otra vez con el mismo tenant y email es seguro y devuelve:

```txt
Local admin already exists
```

La segunda ejecucion no cambia el nombre ni la contrasena del usuario existente.
La rotacion de contrasena debe hacerse mediante `admin-api`.

El comando falla sin modificar datos cuando:

- El tenant no existe o esta inactivo.
- El tenant no tiene el rol `admin`.
- El email ya existe, pero no posee el rol `admin`.
- Ya existe otro administrador activo con un email diferente.

## Verificar el login

Levantar la API principal:

```bash
npm run dev:main
```

Enviar:

```http
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "admin.norte@crit.example",
  "password": "una-contrasena-temporal-segura"
}
```

La respuesta debe contener un access token, el `tenantId` resuelto y el rol
`admin`. La API resuelve el tenant internamente a partir del email siempre que
exista una sola coincidencia activa. Nunca debe contener `password` ni
`passwordHash`.

Tambien puede ejecutarse la prueba integral despues del bootstrap:

```bash
npm run test:integration
```

Esta prueba crea y elimina un usuario ficticio dentro del tenant configurado.

## Operacion posterior

El primer administrador usa `admin-api` para crear recepcionistas, medicos,
terapeutas y demas usuarios. El backend obtiene `tenantId` del JWT; los payloads
de administracion no aceptan un tenant elegido por el cliente.

Todos los usuarios creados por ese administrador quedan en su mismo tenant y
deben iniciar sesion con su email y contrasena. Si un mismo email existe en mas
de un tenant activo, el login se rechaza con el mismo error generico de
credenciales invalidas.

Despues de comprobar el acceso:

1. Cambiar la contrasena temporal mediante
   `PUT /admin/users/:userId/password`.
2. Retirar la contrasena de cualquier canal temporal usado para entregarla.
3. Conservar al menos un administrador activo por tenant.

Para dar de alta otro centro, repetir primero la preparacion en `crit-db` y
despues este procedimiento usando el nuevo `BOOTSTRAP_ADMIN_TENANT_CODE`.
