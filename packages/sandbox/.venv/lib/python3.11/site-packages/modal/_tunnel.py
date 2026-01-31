# Copyright Modal Labs 2023
"""Client for Modal relay servers, allowing users to expose TLS."""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Optional

from synchronicity.async_wrap import asynccontextmanager

from modal_proto import api_pb2

from ._utils.async_utils import synchronize_api
from .client import _Client
from .exception import AlreadyExistsError, InvalidError, RemoteError, ServiceError


@dataclass(frozen=True)
class Tunnel:
    """A port forwarded from within a running Modal container. Created by `modal.forward()`.

    **Important:** This is an experimental API which may change in the future.
    """

    host: str
    port: int
    unencrypted_host: str
    unencrypted_port: int

    @property
    def url(self) -> str:
        """Get the public HTTPS URL of the forwarded port."""
        value = f"https://{self.host}"
        if self.port != 443:
            value += f":{self.port}"
        return value

    @property
    def tls_socket(self) -> tuple[str, int]:
        """Get the public TLS socket as a (host, port) tuple."""
        return (self.host, self.port)

    @property
    def tcp_socket(self) -> tuple[str, int]:
        """Get the public TCP socket as a (host, port) tuple."""
        if not self.unencrypted_host:
            raise InvalidError(
                "This tunnel is not configured for unencrypted TCP. Please use `forward(..., unencrypted=True)`."
            )
        return (self.unencrypted_host, self.unencrypted_port)


@asynccontextmanager
async def _forward(
    port: int, *, unencrypted: bool = False, h2_enabled: bool = False, client: Optional[_Client] = None
) -> AsyncIterator[Tunnel]:
    """Expose a port publicly from inside a running Modal container, with TLS.

    If `unencrypted` is set, this also exposes the TCP socket without encryption on a random port
    number. This can be used to SSH into a container (see example below). Note that it is on the public Internet, so
    make sure you are using a secure protocol over TCP.

    If `h2_enabled` is set, the TLS server will advertise support for HTTP/2.

    **Important:** This is an experimental API which may change in the future.

    **Usage:**

    ```python notest
    import modal
    from flask import Flask

    app = modal.App(image=modal.Image.debian_slim().pip_install("Flask"))
    flask_app = Flask(__name__)


    @flask_app.route("/")
    def hello_world():
        return "Hello, World!"


    @app.function()
    def run_app():
        # Start a web server inside the container at port 8000. `modal.forward(8000)` lets us
        # expose that port to the world at a random HTTPS URL.
        with modal.forward(8000) as tunnel:
            print("Server listening at", tunnel.url)
            flask_app.run("0.0.0.0", 8000)

        # When the context manager exits, the port is no longer exposed.
    ```

    **Raw TCP usage:**

    ```python
    import socket
    import threading

    import modal


    def run_echo_server(port: int):
        \"""Run a TCP echo server listening on the given port.\"""
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(("0.0.0.0", port))
        sock.listen(1)

        while True:
            conn, addr = sock.accept()
            print("Connection from:", addr)

            # Start a new thread to handle the connection
            def handle(conn):
                with conn:
                    while True:
                        data = conn.recv(1024)
                        if not data:
                            break
                        conn.sendall(data)

            threading.Thread(target=handle, args=(conn,)).start()


    app = modal.App()


    @app.function()
    def tcp_tunnel():
        # This exposes port 8000 to public Internet traffic over TCP.
        with modal.forward(8000, unencrypted=True) as tunnel:
            # You can connect to this TCP socket from outside the container, for example, using `nc`:
            #  nc <HOST> <PORT>
            print("TCP tunnel listening at:", tunnel.tcp_socket)
            run_echo_server(8000)
    ```

    **SSH example:**
    This assumes you have a rsa keypair in `~/.ssh/id_rsa{.pub}`, this is a bare-bones example
    letting you SSH into a Modal container.

    ```python
    import subprocess
    import time

    import modal

    app = modal.App()
    image = (
        modal.Image.debian_slim()
        .apt_install("openssh-server")
        .run_commands("mkdir /run/sshd")
        .add_local_file("~/.ssh/id_rsa.pub", "/root/.ssh/authorized_keys", copy=True)
    )


    @app.function(image=image, timeout=3600)
    def some_function():
        subprocess.Popen(["/usr/sbin/sshd", "-D", "-e"])
        with modal.forward(port=22, unencrypted=True) as tunnel:
            hostname, port = tunnel.tcp_socket
            connection_cmd = f'ssh -p {port} root@{hostname}'
            print(f"ssh into container using: {connection_cmd}")
            time.sleep(3600)  # keep alive for 1 hour or until killed
    ```

    If you intend to use this more generally, a suggestion is to put the subprocess and port
    forwarding code in an `@enter` lifecycle method of an @app.cls, to only make a single
    ssh server and port for each container (and not one for each input to the function).
    """

    if not isinstance(port, int):
        raise InvalidError(f"The port argument should be an int, not {port!r}")
    if port < 1 or port > 65535:
        raise InvalidError(f"Invalid port number {port}")
    if h2_enabled and unencrypted:
        raise InvalidError("H2 can only be used with encrypted ports")

    if not client:
        client = await _Client.from_env()

    if client.client_type != api_pb2.CLIENT_TYPE_CONTAINER:
        raise InvalidError("Forwarding ports only works inside a Modal container")

    tunnel_type = api_pb2.TUNNEL_TYPE_H2 if h2_enabled else api_pb2.TUNNEL_TYPE_UNSPECIFIED
    try:
        response = await client.stub.TunnelStart(
            api_pb2.TunnelStartRequest(port=port, unencrypted=unencrypted, tunnel_type=tunnel_type)
        )
    except AlreadyExistsError as exc:
        raise InvalidError(f"Port {port} is already forwarded")
    except ServiceError as exc:
        raise RemoteError("Relay server is unavailable") from exc

    try:
        yield Tunnel(response.host, response.port, response.unencrypted_host, response.unencrypted_port)
    finally:
        await client.stub.TunnelStop(api_pb2.TunnelStopRequest(port=port))


forward = synchronize_api(_forward)
