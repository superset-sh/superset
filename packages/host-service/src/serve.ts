import { serve } from "@hono/node-server";
import { createApp } from "./app";

const dbPath = process.env.HOST_DB_PATH?.trim() || undefined;
const app = createApp({ dbPath });
const port = Number(process.env.PORT) || 4879;

serve({ fetch: app.fetch, port }, (info) => {
	console.log(`[host-service] listening on http://localhost:${info.port}`);
});
