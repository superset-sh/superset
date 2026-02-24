import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import {
	type ChatMastraServiceRouter,
	type CreateChatMastraServiceRouterOptions,
	createChatMastraServiceRouter,
} from "../trpc";

export interface CreateChatMastraHonoAppOptions {
	routerOptions: CreateChatMastraServiceRouterOptions;
	endpoint?: string;
}

export function createChatMastraHonoApp({
	routerOptions,
	endpoint = "/trpc/chat-mastra",
}: CreateChatMastraHonoAppOptions): {
	app: Hono;
	router: ChatMastraServiceRouter;
} {
	const app = new Hono();
	const router = createChatMastraServiceRouter(routerOptions);

	app.all(`${endpoint}/*`, async (c) => {
		return fetchRequestHandler({
			endpoint,
			req: c.req.raw,
			router,
		});
	});

	return { app, router };
}
