# Copyright Modal Labs 2023
# type: ignore
import json
import os
import secrets
import socket
import subprocess
import threading
import time
import webbrowser
from typing import Any

from modal import App, Image, Queue, Secret, Volume, forward

# Passed by `modal launch` locally via CLI, plumbed to remote runner through secrets.
args: dict[str, Any] = json.loads(os.environ.get("MODAL_LAUNCH_ARGS", "{}"))

CODE_SERVER_INSTALLER = "https://code-server.dev/install.sh"
CODE_SERVER_ENTRYPOINT = (
    "https://raw.githubusercontent.com/coder/code-server/refs/tags/v4.96.1/ci/release-image/entrypoint.sh"
)
FIXUD_INSTALLER = "https://github.com/boxboat/fixuid/releases/download/v0.6.0/fixuid-0.6.0-linux-$ARCH.tar.gz"


app = App()
image = (
    Image.from_registry(args.get("image"), add_python="3.11")
    .apt_install("curl", "dumb-init", "git", "git-lfs")
    .run_commands(
        f"curl -fsSL {CODE_SERVER_INSTALLER} | sh",
        f"curl -fsSL {CODE_SERVER_ENTRYPOINT}  > /code-server.sh",
        "chmod u+x /code-server.sh",
    )
    .run_commands(
        'ARCH="$(dpkg --print-architecture)"'
        f' && curl -fsSL "{FIXUD_INSTALLER}" | tar -C /usr/local/bin -xzf - '
        " && chown root:root /usr/local/bin/fixuid"
        " && chmod 4755 /usr/local/bin/fixuid"
        " && mkdir -p /etc/fixuid"
        ' && echo "user: root" >> /etc/fixuid/config.yml'
        ' && echo "group: root" >> /etc/fixuid/config.yml'
    )
    .run_commands("mkdir /home/coder")
    .env({"ENTRYPOINTD": ""})
)

if args.get("mount"):
    image = image.add_local_dir(
        args.get("mount"),
        remote_path="/home/coder/mount",
    )

volume = (
    Volume.from_name(
        args.get("volume"),
        create_if_missing=True,
    )
    if args.get("volume")
    else None
)
volumes = {"/home/coder/volume": volume} if volume else {}


def wait_for_port(data: tuple[str, str], q: Queue):
    start_time = time.monotonic()
    while True:
        try:
            with socket.create_connection(("localhost", 8080), timeout=30.0):
                break
        except OSError as exc:
            time.sleep(0.01)
            if time.monotonic() - start_time >= 30.0:
                raise TimeoutError("Waited too long for port 8080 to accept connections") from exc
    q.put(data)


@app.function(
    image=image,
    cpu=args.get("cpu"),
    memory=args.get("memory"),
    gpu=args.get("gpu"),
    timeout=args.get("timeout", 3600),
    secrets=[Secret.from_dict({"MODAL_LAUNCH_ARGS": json.dumps(args)})],
    volumes=volumes,
    max_containers=1 if volume else None,
)
def run_vscode(q: Queue):
    os.chdir("/home/coder")
    token = secrets.token_urlsafe(13)
    with forward(8080) as tunnel:
        url = tunnel.url
        print("\nVS Code on Modal, opening in browser...")
        print(f"   -> {url}")
        print(f"   -> password: {token}\n")
        threading.Thread(target=wait_for_port, args=((url, token), q)).start()
        subprocess.run(
            ["/code-server.sh", "--bind-addr", "0.0.0.0:8080", "."],
            env={**os.environ, "SHELL": "/bin/bash", "PASSWORD": token},
        )
    q.put("done")


@app.local_entrypoint()
def main():
    with Queue.ephemeral() as q:
        run_vscode.spawn(q)
        url, token = q.get()
        time.sleep(1)  # Give VS Code a chance to start up
        webbrowser.open(url)
        assert q.get() == "done"
