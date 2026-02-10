import { Hono } from "hono";
import type { AIDBSessionProtocol } from "../protocol";

export function createAuthRoutes(protocol: AIDBSessionProtocol) {
	const app = new Hono();

	app.post("/:sessionId/login", async (c) => {
		const sessionId = c.req.param("sessionId");

		try {
			const body = await c.req.json();
			const { actorId, deviceId, name } = body as {
				actorId: string;
				deviceId: string;
				name?: string;
			};

			if (!actorId || !deviceId) {
				return c.json({ error: "actorId and deviceId are required" }, 400);
			}

			const stream = await protocol.getOrCreateSession(sessionId);

			await protocol.writePresence(
				stream,
				sessionId,
				actorId,
				deviceId,
				"user",
				"online",
				name ?? actorId,
			);

			return c.json({ success: true, actorId, deviceId, status: "online" });
		} catch (error) {
			console.error("Failed to login:", error);
			return c.json(
				{ error: "Failed to login", details: (error as Error).message },
				500,
			);
		}
	});

	app.post("/:sessionId/logout", async (c) => {
		const sessionId = c.req.param("sessionId");

		try {
			const rawBody = await c.req.text();

			let body: { actorId?: string; deviceId?: string; allDevices?: boolean };
			try {
				body = JSON.parse(rawBody);
			} catch (parseError) {
				console.error("[AUTH] Failed to parse logout body:", parseError);
				return c.json({ error: "Invalid JSON body" }, 400);
			}

			const { actorId, deviceId, allDevices } = body;

			if (!actorId) {
				return c.json({ error: "actorId is required" }, 400);
			}

			if (!allDevices && !deviceId) {
				return c.json({ error: "deviceId or allDevices is required" }, 400);
			}

			const stream = protocol.getSession(sessionId);
			if (!stream) {
				return c.json({ error: "Session not found" }, 404);
			}

			if (allDevices) {
				const deviceIds = await protocol.getDeviceIdsForActor(
					sessionId,
					actorId,
				);

				for (const devId of deviceIds) {
					await protocol.writePresence(
						stream,
						sessionId,
						actorId,
						devId,
						"user",
						"offline",
					);
				}

				return c.json({
					success: true,
					actorId,
					devicesLoggedOut: deviceIds.length,
					status: "offline",
				});
			} else {
				await protocol.writePresence(
					stream,
					sessionId,
					actorId,
					deviceId as string,
					"user",
					"offline",
				);

				return c.json({ success: true, actorId, deviceId, status: "offline" });
			}
		} catch (error) {
			console.error("[AUTH] Failed to logout:", error);
			return c.json(
				{ error: "Failed to logout", details: (error as Error).message },
				500,
			);
		}
	});

	return app;
}
