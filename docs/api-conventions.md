# API Conventions

## Base URLs

Main API:

```txt
http://localhost:3000/api
```

Admin API:

```txt
http://localhost:3001/admin
```

Check-in API:

```txt
http://localhost:3002
```

## Convención de respuestas

Los endpoints funcionales deben usar una respuesta consistente:

```json
{
  "success": true,
  "data": {}
}
```

Cuando sea necesario incluir paginación u otros metadatos:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20
  }
}
```

El health check conserva su contrato simple y no usa este wrapper.

## Convención de errores

Los errores usan el status HTTP correspondiente y el siguiente cuerpo:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  }
}
```

Códigos HTTP iniciales:

- `400`: solicitud o validación inválida.
- `401`: autenticación requerida o inválida.
- `403`: permisos insuficientes.
- `404`: recurso o ruta inexistente.
- `409`: conflicto de estado o unicidad.
- `500`: error interno inesperado.

Los errores internos no exponen stack trace, payloads ni detalles sensibles.

## Validación

Los módulos definen sus schemas con Zod y usan el helper compartido para parsear datos. Un error de validación responde con `VALIDATION_ERROR` y solo incluye path y mensaje:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "path": "email",
        "message": "Invalid email address"
      }
    ]
  }
}
```

Nunca se incluye el valor recibido en los detalles de validación.

## Orden de middlewares

Cada app registra, en este orden:

1. Middlewares de seguridad y parsing.
2. Rutas de la aplicación.
3. Middleware de ruta no encontrada.
4. Middleware global de errores.

## Autenticación

Pendiente de implementar con JWT.
