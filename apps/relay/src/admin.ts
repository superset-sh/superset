import { Hono } from "hono";
import * as directory from "./directory";
import { env } from "./env";
import type { TunnelManager } from "./tunnel";

export function createAdminApp(tunnelManager: TunnelManager): Hono {
	const app = new Hono();

	app.use("*", async (c, next) => {
		const secret = env.RELAY_ADMIN_SECRET;
		if (!secret) return c.json({ error: "Admin disabled" }, 503);
		const auth = c.req.header("Authorization");
		if (auth !== `Bearer ${secret}`) {
			return c.json({ error: "Unauthorized" }, 401);
		}
		return next();
	});

	app.get("/tunnels", (c) => {
		const tunnels = tunnelManager.getActiveTunnels();
		const flaps = tunnelManager.getRecentFlaps(10 * 60_000);
		return c.json({
			region: env.FLY_REGION,
			machineId: env.FLY_MACHINE_ID,
			tunnels,
			flaps,
		});
	});

	app.get("/directory", async (c) => {
		const owners = await directory.getAllOwners();
		return c.json({ owners });
	});

	return app;
}
