import { afterEach, describe, expect, it } from "bun:test";
import { createServer, type Server as NetServer } from "node:net";
import express from "express";
import { findFreePort } from "../host-service-utils";
import {
	getNotificationsPort,
	resetNotificationsPortForTests,
} from "./runtime-port";
import { startNotificationsServer } from "./start-server";

const listeningServers: Array<{
	close: (cb?: (error?: Error) => void) => void;
}> = [];

async function occupyPort(port: number): Promise<NetServer> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => resolve());
	});
	return server;
}

async function closeServer(server: {
	close: (cb?: (error?: Error) => void) => void;
}): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.close((error?: Error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}

function createNotificationsTestApp() {
	const app = express();
	app.get("/health", (_req, res) => {
		res.json({ status: "ok" });
	});
	return app;
}

afterEach(async () => {
	while (listeningServers.length > 0) {
		const server = listeningServers.pop();
		if (server) {
			await closeServer(server);
		}
	}
	resetNotificationsPortForTests();
});

describe("startNotificationsServer", () => {
	it("binds the preferred port when it is available", async () => {
		const preferredPort = await findFreePort();
		const result = await startNotificationsServer(
			createNotificationsTestApp(),
			preferredPort,
		);
		listeningServers.push(result.server);

		expect(result.port).toBe(preferredPort);
		expect(result.usedFallbackPort).toBe(false);
		expect(getNotificationsPort()).toBe(preferredPort);

		const response = await fetch(`http://127.0.0.1:${result.port}/health`);
		expect(response.ok).toBe(true);
		expect(await response.json()).toEqual({ status: "ok" });
	});

	it("falls back to a free port when the preferred port is already in use", async () => {
		const preferredPort = await findFreePort();
		const blocker = await occupyPort(preferredPort);
		listeningServers.push(blocker);

		const result = await startNotificationsServer(
			createNotificationsTestApp(),
			preferredPort,
		);
		listeningServers.push(result.server);

		expect(result.port).not.toBe(preferredPort);
		expect(result.usedFallbackPort).toBe(true);
		expect(getNotificationsPort()).toBe(result.port);

		const response = await fetch(`http://127.0.0.1:${result.port}/health`);
		expect(response.ok).toBe(true);
		expect(await response.json()).toEqual({ status: "ok" });
	});
});
