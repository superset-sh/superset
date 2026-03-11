import { serve } from "@hono/node-server";
import { createApp } from "./app";

const app = createApp();
const port = Number(process.env.PORT) || 4879;

serve({ fetch: app.fetch, port }, (info) => {
	console.log(`[host-service] listening on http://localhost:${info.port}`);
});
