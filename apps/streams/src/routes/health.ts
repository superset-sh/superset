import { Hono } from "hono";

export function createHealthRoutes() {
	const app = new Hono();

	app.get("/", (c) => {
		return c.json({
			status: "ok",
			timestamp: new Date().toISOString(),
		});
	});

	app.get("/ready", (c) => {
		return c.json({
			status: "ready",
			timestamp: new Date().toISOString(),
		});
	});

	app.get("/live", (c) => {
		return c.json({
			status: "live",
			timestamp: new Date().toISOString(),
		});
	});

	return app;
}
