import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import {
	type ChatMastraServiceRouter,
	createChatMastraServiceRouter,
} from "../trpc";
import type { RuntimeConfig } from "../trpc/utils/runtime";

export interface CreateChatMastraHonoAppOptions {
	endpoint?: string;
	config: RuntimeConfig;
}

export function createChatMastraHonoApp({
	endpoint = "/trpc/chat-mastra",
	config,
}: CreateChatMastraHonoAppOptions): {
	app: Hono;
	router: ChatMastraServiceRouter;
} {
	const app = new Hono();
	const router = createChatMastraServiceRouter(config);

	app.all(`${endpoint}/*`, async (c) => {
		return fetchRequestHandler({
			endpoint,
			req: c.req.raw,
			router,
		});
	});

	return { app, router };
}
