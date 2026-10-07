#!/usr/bin/env python3
import argparse
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import uuid


def docker(context, *arguments, **options):
    return subprocess.run(
        ["docker", "--context", context, *arguments], check=True, **options
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--docker-context", required=True)
    args = parser.parse_args()
    context = args.docker_context
    endpoint = docker(
        context, "context", "inspect", "--format", "{{.Endpoints.docker.Host}}",
        capture_output=True, text=True,
    ).stdout.strip()
    if not endpoint.startswith("unix://"):
        raise RuntimeError("The proof requires an existing local Unix-socket Docker context")

    builder = docker(context, "buildx", "inspect", context, capture_output=True, text=True).stdout
    fields = dict(line.strip().split(":", 1) for line in builder.splitlines() if ":" in line)
    if any(fields.get(key, "").strip() != value for key, value in {"Driver": "docker", "Endpoint": context, "Status": "running"}.items()):
        raise RuntimeError("The proof requires the existing running Docker driver for the local context")

    excluded = [
        ".env", "apps/usercontent/.env.local", ".envrc",
        "apps/usercontent/.dev.vars", "apps/usercontent/.dev.vars.dev",
        "apps/relay2/.dev.vars", "apps/relay2/.dev.vars.preview",
        "apps/relay/.dev.vars", "apps/relay/.dev.vars.preview",
        "superset-dev-data/auth/account.json", "superset-dev-data/local.db",
        "superset-dev-data/host/proof/host.db", ".mcp.json", ".cursor/mcp.json",
        "apps/usercontent/.wrangler/state/proof.sqlite",
    ]
    allowed = [
        ".env.example", ".env.local.example", "apps/usercontent/.dev.vars.example",
        "apps/relay2/.dev.vars.example", "apps/relay/.dev.vars.example", "apps/usercontent/src/index.ts",
        "packages/shared/src/index.ts", "docker/self-host/storage.env.example",
    ]
    name = f"superset-storage-context-proof-{uuid.uuid4().hex[:12]}"
    tag = f"{name}:test"
    container = None
    try:
        with tempfile.TemporaryDirectory(prefix="superset-storage-context-", dir="/tmp") as temporary:
            fixture = Path(temporary)
            ignore = Path(__file__).resolve().parents[2] / ".dockerignore"
            (fixture / ".dockerignore").write_text(ignore.read_text())
            (fixture / "Dockerfile").write_text("FROM scratch\nCOPY . /context/\n")
            for relative in excluded + allowed:
                destination = fixture / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_text("DISPOSABLE_DUMMY_SENTINEL\n")
            docker(context, "buildx", "build", "--builder", context, "--load", "--no-cache", "-t", tag, str(fixture))
            container = docker(
                context, "create", "--name", name, tag, "/unused",
                capture_output=True, text=True,
            ).stdout.strip()
            archive = docker(context, "export", container, capture_output=True).stdout
            with tarfile.open(fileobj=io.BytesIO(archive)) as exported:
                included = set(exported.getnames())
            leaks = [relative for relative in excluded if f"context/{relative}" in included]
            missing = [relative for relative in allowed if f"context/{relative}" not in included]
            print(json.dumps({"included_disallowed": leaks, "missing_allowed": missing,
                              "excluded_cases": len(excluded), "allowed_cases": len(allowed)}))
            if leaks or missing:
                raise SystemExit(1)
    finally:
        if container:
            docker(context, "rm", container, capture_output=True)
        subprocess.run(["docker", "--context", context, "image", "rm", tag],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == "__main__":
    main()
