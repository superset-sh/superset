import { Hono } from "hono";
import type { AIDBSessionProtocol } from "../protocol";

export function createAuthRoutes(protocol: AIDBSessionProtocol) {
	const app = new Hono();

	app.post("/:sessionId/login", async (c) => {
		const sessionId = c.req.param("sessionId");

		try {
			let body: { actorId?: string; deviceId?: string; name?: string };
			try {
				body = await c.req.json();
			} catch {
				return c.json(
					{ error: "Invalid JSON body", code: "INVALID_BODY", sessionId },
					400,
				);
			}

			const { actorId, deviceId, name } = body as {
				actorId: string;
				deviceId: string;
				name?: string;
			};

			if (!actorId || !deviceId) {
				return c.json(
					{
						error: "actorId and deviceId are required",
						code: "INVALID_BODY",
						sessionId,
					},
					400,
				);
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
				{
					error: "Failed to login",
					code: "LOGIN_FAILED",
					sessionId,
				},
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
				return c.json(
					{ error: "Invalid JSON body", code: "INVALID_BODY", sessionId },
					400,
				);
			}

			const { actorId, deviceId, allDevices } = body;

			if (!actorId) {
				return c.json(
					{ error: "actorId is required", code: "INVALID_BODY", sessionId },
					400,
				);
			}

			if (!allDevices && !deviceId) {
				return c.json(
					{
						error: "deviceId or allDevices is required",
						code: "INVALID_BODY",
						sessionId,
					},
					400,
				);
			}

			const stream = protocol.getSession(sessionId);
			if (!stream) {
				return c.json(
					{ error: "Session not found", code: "SESSION_NOT_FOUND", sessionId },
					404,
				);
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
				{
					error: "Failed to logout",
					code: "LOGOUT_FAILED",
					sessionId,
				},
				500,
			);
		}
	});

	return app;
}
