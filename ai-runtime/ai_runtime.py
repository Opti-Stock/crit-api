#!/usr/bin/env python3
import json
import os
import subprocess
import sys


def embed(payload):
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(
        os.environ["AI_EMBEDDING_MODEL_PATH"],
        local_files_only=True,
    )
    vectors = model.encode(
        payload["texts"],
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return vectors.tolist()


def generate(payload):
    schema = {
        "summary": {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "relevantPoints": {"type": "array", "items": {"type": "string"}},
                "pendingItems": {"type": "array", "items": {"type": "string"}},
                "explicitAlerts": {"type": "array", "items": {"type": "string"}},
                "sourceNoteIds": {"type": "array", "items": {"type": "string"}},
            },
            "required": [
                "summary",
                "relevantPoints",
                "pendingItems",
                "explicitAlerts",
                "sourceNoteIds",
            ],
            "additionalProperties": False,
        },
        "answer": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["supported", "insufficient_information"],
                },
                "answer": {"type": "string"},
                "sourceNoteIds": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["status", "answer", "sourceNoteIds"],
            "additionalProperties": False,
        },
    }[payload["task"]]
    command = [
        os.environ.get("LLAMA_CLI_PATH", "/opt/llama.cpp/llama-cli"),
        "--model",
        os.environ["AI_GENERATION_MODEL_PATH"],
        "--prompt",
        payload["prompt"],
        "--json-schema",
        json.dumps(schema, separators=(",", ":")),
        "--temp",
        "0.1",
        "--ctx-size",
        os.environ.get("AI_CONTEXT_SIZE", "8192"),
        "--no-display-prompt",
    ]
    result = subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
        timeout=int(os.environ.get("AI_GENERATION_TIMEOUT_SECONDS", "210")),
    )
    return json.loads(result.stdout.strip())


def main():
    payload = json.load(sys.stdin)
    if len(sys.argv) != 2 or sys.argv[1] not in {"embed", "generate"}:
        raise ValueError("Expected embed or generate")
    output = embed(payload) if sys.argv[1] == "embed" else generate(payload)
    json.dump(output, sys.stdout, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
