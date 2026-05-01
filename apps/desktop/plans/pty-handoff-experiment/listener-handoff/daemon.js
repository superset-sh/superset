#!/usr/bin/env node
// Daemon: binds the listener itself if invoked fresh, OR adopts an inherited
// listener fd if invoked via handoff. Replies `pid=<our-pid>` on each
// connection.
//
// Modes:
//   fresh handoff:     node daemon.js fresh   <socket-path>
//   handoff successor: node daemon.js adopt   <socket-path>     (fd 3 = listener)
//
// Trigger handoff: SIGUSR1 to the daemon. It will spawn its own successor
// with stdio: [ignore, inherit, inherit, listenerFd, controlFd], wait for
// "ack" on the control fd, then exit.

const childProcess = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const mode = process.argv[2];
const socketPath = process.argv[3];
const id = process.argv[4] ?? "?";

if (mode !== "fresh" && mode !== "adopt") {
	process.stderr.write(`usage: daemon.js fresh|adopt <socketPath> [id]\n`);
	process.exit(2);
}

const log = (msg) =>
	process.stderr.write(`[daemon-${id} pid=${process.pid}] ${msg}\n`);

const INHERITED_LISTENER_FD = 3;
const HANDOFF_CONTROL_FD = 4;

const server = net.createServer((socket) => {
	socket.write(`from pid=${process.pid}\n`);
	socket.end();
});

async function bindFresh() {
	try {
		fs.unlinkSync(socketPath);
	} catch (err) {
		if (err.code !== "ENOENT") throw err;
	}
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(socketPath, () => {
			server.off("error", reject);
			resolve();
		});
	});
	fs.chmodSync(socketPath, 0o600);
}

async function adoptInherited() {
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen({ fd: INHERITED_LISTENER_FD }, () => {
			server.off("error", reject);
			resolve();
		});
	});
}

function getListenerFd() {
	const handle = server._handle;
	if (!handle || typeof handle.fd !== "number" || handle.fd < 0) {
		throw new Error(`could not read listener fd; handle=${handle}`);
	}
	return handle.fd;
}

async function performHandoff() {
	log("performing handoff");

	const listenerFd = getListenerFd();
	log(`listener fd is ${listenerFd}`);

	// Open a socketpair-like control channel via Node's existing IPC isn't
	// trivial here because we're not using `process.send`. We'll use stdio
	// fd 4 — the parent (current daemon) creates a `net.Socket` from
	// the parent end, the child reads/writes on its inherited fd 4.
	//
	// Easiest: use `net.Socket` over a pre-built unix socketpair from
	// `node:net`'s server.... actually nodejs doesn't expose socketpair(2)
	// directly. Workaround: use a temp short-lived pipe via `pipe()`.
	//
	// Even simpler for the spike: create a one-shot AF_UNIX listener
	// for the ack on a temp socket path, child connects to it.
	const ackSocketPath = `${socketPath}.ack-${process.pid}`;
	try {
		fs.unlinkSync(ackSocketPath);
	} catch (err) {
		if (err.code !== "ENOENT") throw err;
	}

	const ackServer = net.createServer();
	const ackPromise = new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			ackServer.close();
			reject(new Error("ack timed out"));
		}, 5000);
		ackServer.once("connection", (sock) => {
			clearTimeout(timer);
			let buf = "";
			sock.setEncoding("utf8");
			sock.on("data", (d) => {
				buf += d;
				if (buf.includes("\n")) {
					sock.end();
					ackServer.close();
					resolve(buf.trim());
				}
			});
			sock.on("error", reject);
		});
	});
	await new Promise((resolve, reject) => {
		ackServer.once("error", reject);
		ackServer.listen(ackSocketPath, () => {
			ackServer.off("error", reject);
			resolve();
		});
	});

	// Stop accepting on our listener — but DO NOT close the underlying fd.
	// The successor inherits it and will start accepting once it's up.
	// `server._handle.unref()` is not enough; we need to detach the libuv
	// accept watcher. The cleanest way is to swap our `connection` listener
	// for a no-op that immediately closes — incoming connections during the
	// handoff window get dropped (clients retry).
	server.removeAllListeners("connection");
	server.on("connection", (sock) => sock.destroy());

	const child = childProcess.spawn(
		process.execPath,
		[__filename, "adopt", socketPath, "B", ackSocketPath],
		{
			stdio: ["ignore", "inherit", "inherit", listenerFd],
			detached: false,
		},
	);
	log(`spawned successor pid=${child.pid}`);

	const ack = await ackPromise;
	log(`received ack: ${ack}`);
	if (!ack.startsWith("upgrade-ack ")) {
		throw new Error(`unexpected ack: ${ack}`);
	}

	// Successor is up. We must NOT call `server.close()` here — Node's
	// net.Server.close() unlinks the socket-path directory entry when the
	// server was bound by path. The successor still holds a dup'd fd to the
	// in-kernel socket, so the kernel side stays alive — but if we unlink
	// the path, new clients can't `connect("/tmp/.../*.sock")` (ENOENT).
	// Just exit; the process teardown closes our fd table without running
	// Node's close handlers. The path → in-kernel-socket binding persists
	// because the successor's fd keeps a refcount on the socket.
	log("exiting after handoff (no server.close — preserves socket path)");
	process.exit(0);
}

async function sendAckIfAdopt() {
	if (mode !== "adopt") return;
	const ackSocketPath = process.argv[5];
	if (!ackSocketPath) return;
	await new Promise((resolve, reject) => {
		const sock = net.createConnection(ackSocketPath, () => {
			sock.write(`upgrade-ack pid=${process.pid}\n`);
			sock.end(() => resolve());
		});
		sock.on("error", reject);
	});
	log("sent upgrade-ack to predecessor");
}

async function main() {
	if (mode === "fresh") {
		await bindFresh();
		log(`listening on ${socketPath} (bound fresh)`);
	} else {
		await adoptInherited();
		log(`listening on inherited fd=${INHERITED_LISTENER_FD}`);
		await sendAckIfAdopt();
	}

	process.on("SIGUSR1", () => {
		performHandoff().catch((err) => {
			log(`handoff failed: ${err.message}`);
		});
	});
	process.on("SIGTERM", () => {
		log("received SIGTERM");
		server.close(() => process.exit(0));
		setTimeout(() => process.exit(0), 500).unref();
	});

	log("ready");
}

main().catch((err) => {
	log(`fatal: ${err.stack ?? err.message}`);
	process.exit(1);
});
