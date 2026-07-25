# IA local, resúmenes y RAG

## Límites de seguridad

La IA resume hechos explícitos y responde únicamente con evidencia de las notas
autorizadas. No diagnostica, prescribe ni crea recomendaciones clínicas. Sus
respuestas no se copian automáticamente al expediente.

Los prompts, notas y respuestas nunca se escriben en stdout. Los logs operativos
solo contienen identificadores, tipo de trabajo, duración y código de error. El
historial protegido permanece en PostgreSQL con RLS.

## Modelos

- Embeddings: `intfloat/multilingual-e5-small`, 384 dimensiones.
- Generación: `ggml-org/Qwen3-1.7B-GGUF`, archivo
  `Qwen3-1.7B-Q4_K_M.gguf`.
- Inferencia generativa: `llama.cpp`.

Las revisiones, el commit de `llama.cpp` y los SHA-256 son argumentos obligatorios
de `Dockerfile.ai`. La construcción descarga los modelos y falla si los hashes no
coinciden. En ejecución se activan los modos offline de Hugging Face.

## Desarrollo local

Sin modelos reales:

```powershell
$env:AI_ENABLED="true"
$env:AI_RUNTIME="mock"
$env:AI_WORKER_TENANT_IDS="TENANT_UUID"
npm run worker:ai
```

El runtime mock solo sirve para contratos y CI. No debe usarse en Render.

Con modelos locales, configurar sus rutas para `ai-runtime/ai_runtime.py` y usar:

```powershell
$env:AI_RUNTIME="local"
$env:AI_EMBEDDING_COMMAND="python ai-runtime/ai_runtime.py embed"
$env:AI_GENERATION_COMMAND="python ai-runtime/ai_runtime.py generate"
$env:AI_EMBEDDING_MODEL_PATH="C:\models\multilingual-e5-small"
$env:AI_GENERATION_MODEL_PATH="C:\models\Qwen3-1.7B-Q4_K_M.gguf"
npm run worker:ai
```

Para reindexar notas visibles para un usuario autorizado:

```powershell
npm run ai:reindex -- --tenant TENANT_UUID --user AUTHORIZED_USER_UUID
```

## Perfil Docker Compose

El perfil `ai` es opt-in: el arranque normal de las cuatro API no descarga ni
carga modelos. Antes de construirlo, copia los cinco pins verificados del
registro de modelos a tu `.env`:

```txt
LLAMA_CPP_COMMIT=<commit completo>
E5_MODEL_REVISION=<revision inmutable>
E5_MODEL_SHA256=<sha256 verificado>
QWEN_MODEL_REVISION=<revision inmutable>
QWEN_MODEL_SHA256=<sha256 verificado>
AI_WORKER_TENANT_IDS=<tenant demo>
```

Con `crit-db` ya levantado y migrado:

```bash
docker compose --profile ai build ai-worker
docker compose --profile ai up -d ai-worker
docker compose ps ai-worker
```

El contenedor no publica puertos. Su healthcheck comprueba que el proceso siga
vivo y el estado funcional se observa mediante el heartbeat que escribe en
PostgreSQL por tenant. Si falta un pin o un hash no coincide, la imagen falla
durante el build.

## Imagen de Render

Construir `Dockerfile.ai` pasando valores fijados:

```bash
docker build -f Dockerfile.ai \
  --build-arg LLAMA_CPP_COMMIT=PINNED_COMMIT \
  --build-arg E5_MODEL_REVISION=PINNED_REVISION \
  --build-arg E5_MODEL_SHA256=VERIFIED_SNAPSHOT_SHA256 \
  --build-arg QWEN_MODEL_REVISION=PINNED_REVISION \
  --build-arg QWEN_MODEL_SHA256=VERIFIED_FILE_SHA256 \
  -t crit-ai-worker .
```

El servicio es un background worker privado, procesa un trabajo a la vez y no
expone puertos. `AI_ENABLED=false` deja agenda y notas operativas mientras
resúmenes y preguntas responden indisponibilidad controlada.

## Recuperación

Los trabajos usan `FOR UPDATE SKIP LOCKED`, dos intentos y timeout configurable.
Un heartbeat por tenant permite detectar workers detenidos. Si cambia cualquier
modelo, revisión o regla de fragmentación, ejecutar reindexación completa antes
de habilitar preguntas.
