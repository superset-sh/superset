import { serve } from "@hono/node-server";
import app from "./index";

const port = Number(process.env.PORT) || 4879;

serve({ fetch: app.fetch, port }, (info) => {
	console.log(`[workspace-service] listening on http://localhost:${info.port}`);
});
