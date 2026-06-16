import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import { env } from "shared/env.shared";
import { findFreePort } from "../host-service-utils";
import { setNotificationsPort } from "./runtime-port";

export interface NotificationsServerStartResult {
	server: Server;
	port: number;
	preferredPort: number;
	usedFallbackPort: boolean;
}

function getBoundPort(server: Server): number {
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("[notifications] Could not determine bound port");
	}
	return (address as AddressInfo).port;
}

function listenOnPort(app: Express, port: number): Promise<Server> {
	return new Promise((resolve, reject) => {
		const server = app.listen(port, "127.0.0.1");

		const handleError = (error: Error) => {
			server.off("listening", handleListening);
			reject(error);
		};

		const handleListening = () => {
			server.off("error", handleError);
			resolve(server);
		};

		server.once("error", handleError);
		server.once("listening", handleListening);
	});
}

function isAddressInUse(error: unknown): error is NodeJS.ErrnoException {
	return (
		error instanceof Error && "code" in error && error.code === "EADDRINUSE"
	);
}

export async function startNotificationsServer(
	app: Express,
	preferredPort = env.DESKTOP_NOTIFICATIONS_PORT,
): Promise<NotificationsServerStartResult> {
	try {
		const server = await listenOnPort(app, preferredPort);
		const port = getBoundPort(server);
		setNotificationsPort(port);
		console.log(`[notifications] Listening on http://127.0.0.1:${port}`);
		return {
			server,
			port,
			preferredPort,
			usedFallbackPort: port !== preferredPort,
		};
	} catch (error) {
		if (!isAddressInUse(error)) {
			console.error(
				`[notifications] Failed to start on port ${preferredPort}:`,
				error,
			);
			throw error;
		}

		const retryPort = await findFreePort([preferredPort]);
		const server = await listenOnPort(app, retryPort);
		const port = getBoundPort(server);
		setNotificationsPort(port);

		if (port === preferredPort) {
			console.warn(
				`[notifications] Port ${preferredPort} was busy on first attempt but became available on retry`,
			);
		} else {
			console.warn(
				`[notifications] Port ${preferredPort} is in use; falling back to http://127.0.0.1:${port}`,
			);
		}

		console.log(`[notifications] Listening on http://127.0.0.1:${port}`);
		return {
			server,
			port,
			preferredPort,
			usedFallbackPort: port !== preferredPort,
		};
	}
}
