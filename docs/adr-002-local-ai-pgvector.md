# ADR 002: IA local y recuperación con pgvector

## Estado

Aceptada para la demo controlada.

## Decisión

Ejecutar Qwen3-1.7B Q4_K_M con `llama.cpp` y multilingual-e5-small dentro de un
worker privado. PostgreSQL conserva embeddings y ejecuta recuperación híbrida
exacta con vector y full-text search combinados mediante RRF.

La API solo crea trabajos. Cada trabajo conserva tenant y usuario solicitante
para que el worker revalide RLS. Los resúmenes recorren todo el historial; la
búsqueda vectorial se usa únicamente para preguntas.

## Consecuencias

- No se envía contenido clínico a proveedores externos.
- La demo necesita una imagen mayor y memoria suficiente para ambos modelos.
- La latencia es asíncrona y la aplicación sigue operativa sin worker.
- HNSW, escalamiento horizontal y habilitación productiva requieren evaluación
  posterior de recall, privacidad y responsabilidad clínica.
