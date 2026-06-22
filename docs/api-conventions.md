# API conventions

## Base URLs

- Main API: `http://localhost:3000/api`
- Admin API: `http://localhost:3001/admin`
- Check-in API: `http://localhost:3002`; actualmente solo expone `/health`.

## Respuestas

Los endpoints funcionales envuelven respuestas exitosas con `success` y
`data`. `meta` se agrega cuando existe paginacion:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 0
  }
}
```

Una creacion responde `201`; una actualizacion normalmente responde `200`; el
cambio de password administrativo responde `204`. Los health checks conservan
su contrato simple y no usan el wrapper:

```json
{ "status": "ok", "service": "main-api" }
```

## Errores

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  }
}
```

- `400`: solicitud o validacion invalida.
- `401`: credenciales o access token invalidos.
- `403`: rol, ownership o acceso a clinica insuficiente.
- `404`: recurso no visible dentro del tenant o ruta inexistente.
- `409`: conflicto de estado, unicidad o regla de negocio.
- `500`: error inesperado con mensaje generico.

El middleware global nunca devuelve stack traces, SQL, payloads internos ni
contenido clinico. Los errores de validacion usan `VALIDATION_ERROR` y solo
incluyen path y mensaje:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "path": "email", "message": "Invalid email address" }
    ]
  }
}
```

## Autenticacion

`POST /api/auth/login` es publico. Las demas rutas funcionales usan el pipeline
de autenticacion y tenant; `GET /api/auth/me` devuelve el contexto validado.

Los access tokens se verifican con HS256, expiracion, issuer y audience. El
tenant se deriva exclusivamente del claim `tenantId`. Los selectores
`tenantId`, `tenant_id` y `x-tenant-id` enviados por clientes son rechazados en
rutas protegidas.

La autorizacion por rol usa semantica OR. El acceso final puede restringirse
ademas por tenant, clinicas asignadas, colaborador vinculado y ownership.

## Paginacion y fechas

Los listados paginados usan `page` desde `1` y `pageSize` con maximo `100`. Las
fechas y horas HTTP usan ISO 8601 con zona horaria. Los identificadores son UUID
de PostgreSQL.

## Orden de middlewares

1. `helmet`, CORS y parsing JSON.
2. Rutas publicas o pipeline de autenticacion/autorizacion por router.
3. Middleware de ruta no encontrada.
4. Middleware global de errores.
