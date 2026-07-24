#!/usr/bin/env python3
import hashlib
import os
from pathlib import Path

from huggingface_hub import hf_hub_download, snapshot_download


def file_sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def snapshot_sha256(root):
    digest = hashlib.sha256()
    files = sorted(path for path in Path(root).rglob("*") if path.is_file())
    for path in files:
        digest.update(str(path.relative_to(root)).replace("\\", "/").encode())
        digest.update(file_sha256(path).encode())
    return digest.hexdigest()


def require_match(name, actual, expected):
    if not expected or actual.lower() != expected.lower():
        raise RuntimeError(f"{name} SHA-256 mismatch: {actual}")


embedding_path = snapshot_download(
    repo_id="intfloat/multilingual-e5-small",
    revision=os.environ["E5_MODEL_REVISION"],
    local_dir="/opt/models/multilingual-e5-small",
    allow_patterns=[
        "*.json",
        "*.txt",
        "*.model",
        "*.safetensors",
        "sentence_bert_config.json",
    ],
)
require_match(
    "multilingual-e5-small snapshot",
    snapshot_sha256(embedding_path),
    os.environ["E5_MODEL_SHA256"],
)

generation_path = hf_hub_download(
    repo_id="ggml-org/Qwen3-1.7B-GGUF",
    filename="Qwen3-1.7B-Q4_K_M.gguf",
    revision=os.environ["QWEN_MODEL_REVISION"],
    local_dir="/opt/models/qwen3-1.7b",
)
require_match(
    "Qwen3-1.7B-Q4_K_M",
    file_sha256(generation_path),
    os.environ["QWEN_MODEL_SHA256"],
)
