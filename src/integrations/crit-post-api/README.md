# CRIT POST API integration

Worker temporal que envia eventos `attendance.registered` almacenados en
`crit_api_outbox`. La asistencia y el evento se confirman atomicamente antes de
cualquier solicitud HTTP, por lo que una falla externa no bloquea ni revierte el
flujo operativo.

El payload es provisional, versionado y no contiene notas medicas ni datos de
contacto. El contrato, configuracion, reintentos y comandos de validacion se
documentan en [`docs/crit-api-integration.md`](../../../docs/crit-api-integration.md).
