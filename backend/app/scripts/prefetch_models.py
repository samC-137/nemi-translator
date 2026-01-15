import os
import sys
from typing import Iterable

try:
    from huggingface_hub import snapshot_download
except ImportError:  # pragma: no cover - runtime safeguard
    print("huggingface_hub is not installed in this environment.")
    sys.exit(1)

FASTER_WHISPER_REPOS = {
    "tiny": "Systran/faster-whisper-tiny",
    "tiny.en": "Systran/faster-whisper-tiny.en",
    "base": "Systran/faster-whisper-base",
    "base.en": "Systran/faster-whisper-base.en",
    "small": "Systran/faster-whisper-small",
    "small.en": "Systran/faster-whisper-small.en",
    "medium": "Systran/faster-whisper-medium",
    "medium.en": "Systran/faster-whisper-medium.en",
    "large-v2": "Systran/faster-whisper-large-v2",
    "large-v3": "Systran/faster-whisper-large-v3",
}


def _split_env_list(raw: str) -> list[str]:
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def _collect_whisper_repo(model: str) -> str | None:
    if not model:
        return None
    if os.path.isabs(model):
        return None
    if model in FASTER_WHISPER_REPOS:
        return FASTER_WHISPER_REPOS[model]
    if "/" in model:
        return model
    return None


def _collect_marian_repos(raw: str) -> list[str]:
    repos: list[str] = []
    for entry in _split_env_list(raw):
        if "=" not in entry:
            continue
        _, model = entry.split("=", 1)
        model = model.strip()
        if not model or os.path.isabs(model):
            continue
        repos.append(model)
    return repos


def _download(repos: Iterable[str], cache_dir: str) -> None:
    for repo in repos:
        print(f"Downloading {repo} -> cache {cache_dir}")
        snapshot_download(repo_id=repo, cache_dir=cache_dir, local_dir_use_symlinks=False)


def main() -> None:
    cache_dir = os.getenv("HF_HOME", "/models/hf")
    os.environ.setdefault("HF_HOME", cache_dir)
    os.environ["HF_HUB_OFFLINE"] = "0"
    os.environ["TRANSFORMERS_OFFLINE"] = "0"

    repos: list[str] = []

    if os.getenv("STT_PROVIDER") == "faster-whisper":
        stt_model = os.getenv("STT_MODEL", "")
        stt_repo = _collect_whisper_repo(stt_model)
        if stt_repo:
            repos.append(stt_repo)

    if os.getenv("MT_PROVIDER") == "marian":
        repos.extend(_collect_marian_repos(os.getenv("MT_MODELS", "")))

    repos = sorted(set(repos))
    if not repos:
        print("No Hugging Face models resolved from env.")
        return

    _download(repos, cache_dir)
    print("Done.")


if __name__ == "__main__":
    main()
