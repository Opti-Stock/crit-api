# Module Template

Cada módulo debe seguir esta estructura:

```txt
module-name/
├── module-name.routes.ts
├── module-name.controller.ts
├── module-name.service.ts
├── module-name.repository.ts
├── module-name.validation.ts
├── module-name.constants.ts
└── README.md
```

## Responsabilidades

- Routes: endpoints.
- Controller: request/response.
- Service: reglas de negocio.
- Repository: queries PostgreSQL.
- Validation: validación de entrada.
- Constants: estados y enums.
