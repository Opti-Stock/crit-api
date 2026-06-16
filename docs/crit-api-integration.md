# Integración temporal con API CRIT

El sistema deberá guardar primero en PostgreSQL y después enviar un POST a la API del CRIT.

Se recomienda usar una tabla tipo outbox:

```txt
crit_api_outbox
```

Esto evita perder información si la API externa falla.
