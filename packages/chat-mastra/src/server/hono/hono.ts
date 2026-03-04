import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import { ChatMastraService, type ChatMastraServiceRouter } from "../trpc";

export interface CreateChatMastraHonoAppOptions {
	endpoint?: string;
}

export function createChatMastraHonoApp({
	endpoint = "/trpc/chat-mastra",
}: CreateChatMastraHonoAppOptions = {}): {
	app: Hono;
	router: ChatMastraServiceRouter;
} {
	const app = new Hono();
	const service = new ChatMastraService({
		headers: () => ({}),
		apiUrl: "",
	});
	const router = service.createRouter();

	app.all(`${endpoint}/*`, async (c) => {
		return fetchRequestHandler({
			endpoint,
			req: c.req.raw,
			router,
		});
	});

	return { app, router };
}
