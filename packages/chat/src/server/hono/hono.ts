import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import { ChatRuntimeService, type ChatRuntimeServiceRouter } from "../trpc";

export interface CreateChatRuntimeHonoAppOptions {
	endpoint?: string;
}

export function createChatRuntimeHonoApp({
	endpoint = "/trpc/chat",
}: CreateChatRuntimeHonoAppOptions = {}): {
	app: Hono;
	router: ChatRuntimeServiceRouter;
} {
	const app = new Hono();
	const service = new ChatRuntimeService({
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
