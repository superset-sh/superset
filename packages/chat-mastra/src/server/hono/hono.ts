import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import {
	type CreateChatMastraServiceRouterOptions,
	type ChatMastraServiceRouter,
	createChatMastraServiceRouter,
} from "../trpc";

export interface CreateChatMastraHonoAppOptions {
	endpoint?: string;
	runtime?: CreateChatMastraServiceRouterOptions["runtime"];
}

export function createChatMastraHonoApp({
	endpoint = "/trpc/chat-mastra",
	runtime,
}: CreateChatMastraHonoAppOptions): {
	app: Hono;
	router: ChatMastraServiceRouter;
} {
	const app = new Hono();
	const router = createChatMastraServiceRouter({ runtime });

	app.all(`${endpoint}/*`, async (c) => {
		return fetchRequestHandler({
			endpoint,
			req: c.req.raw,
			router,
		});
	});

	return { app, router };
}
