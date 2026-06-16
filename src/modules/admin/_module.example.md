# Template mínimo para módulo admin

Cuando se implemente este módulo, debe respetar esta separación:

routes -> controller -> service -> repository -> PostgreSQL

Regla principal:

- El controller no debe tener lógica de negocio.
- El service no debe ejecutar SQL directo.
- El repository no debe conocer detalles HTTP.
- Las validaciones deben quedar separadas.
