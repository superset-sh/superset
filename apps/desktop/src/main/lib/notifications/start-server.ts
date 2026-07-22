import type { Server } from "node:http";
import type { Express } from "express";

export interface StartNotificationsServerOptions {
	/** The Express app to serve. */
	app: Pick<Express, "listen">;
	/** Port to bind on. */
	port: number;
	/** Host/interface to bind on. Defaults to loopback. */
	host?: string;
	/** Invoked once the server is successfully listening. */
	onListening?: (port: number) => void;
	/**
	 * Invoked when `.listen()` emits an `error` event (e.g. `EADDRINUSE` from a
	 * stale/orphan listener left by a prior ungraceful exit). Without this the
	 * error goes unhandled and Node throws, silently killing the notifications
	 * server for the rest of the session.
	 */
	onError?: (err: NodeJS.ErrnoException) => void;
}

/**
 * Starts the notifications HTTP server with an `error` handler attached.
 *
 * The bare `app.listen(port, host, cb)` used previously never observed the
 * server's `error` event. When the port was unavailable — most reproducibly a
 * stale TCP listener from a prior ungraceful exit — `.listen()` emitted
 * `EADDRINUSE` as an unhandled `error`, silently breaking every agent
 * completion notification until reboot. See issue #4133.
 */
export function startNotificationsServer({
	app,
	port,
	host = "127.0.0.1",
	onListening,
	onError,
}: StartNotificationsServerOptions): Server {
	const server = app.listen(port, host);

	// Use the `listening` event rather than the `.listen()` callback: the
	// callback can fire spuriously (even on a failed bind) under some
	// express/runtime combinations, whereas `listening` only emits on a
	// genuinely successful bind.
	server.on("listening", () => {
		console.log(`[notifications] Listening on http://${host}:${port}`);
		onListening?.(port);
	});

	server.on("error", (err: NodeJS.ErrnoException) => {
		if (err.code === "EADDRINUSE") {
			console.error(
				`[notifications] Port ${port} is already in use ` +
					`(possibly an orphan listener from a prior ungraceful exit). ` +
					`Agent completion notifications will not work until this is resolved.`,
			);
		} else {
			console.error("[notifications] listen error:", err);
		}
		onError?.(err);
	});

	return server;
}
