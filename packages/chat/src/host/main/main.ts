import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { ChatService } from "../chat-service";
import type { ChatHostAuthProvider } from "../lib/auth/auth";
import { createChatServiceRouter } from "../router";

const deviceId = process.env.DEVICE_ID ?? "docker";
const apiUrl = process.env.API_URL ?? "";
const organizationId = process.env.ORGANIZATION_ID ?? "";
const authToken = process.env.AUTH_TOKEN ?? "";
const port = Number(process.env.PORT ?? "3001");

const authProvider: ChatHostAuthProvider = {
	getHeaders: (): Record<string, string> =>
		authToken ? { Authorization: `Bearer ${authToken}` } : {},
};

const service = new ChatService({ deviceId, apiUrl, authProvider });

async function main() {
	await service.start({ organizationId });

	const router = createChatServiceRouter(service);

	Bun.serve({
		port,
		fetch: (req) =>
			fetchRequestHandler({
				router,
				req,
				endpoint: "/trpc",
			}),
	});

	console.log(`[chat-host] Listening on port ${port}`);
}

main().catch(console.error);
