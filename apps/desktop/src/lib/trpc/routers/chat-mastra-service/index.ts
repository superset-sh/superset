import {
	type CreateChatMastraServiceRouterOptions,
	createChatMastraServiceRouter as buildRouter,
} from "@superset/chat-mastra/server/trpc";

export const createChatMastraServiceRouter = (
	options?: CreateChatMastraServiceRouterOptions,
) => buildRouter(options);

export type ChatMastraServiceDesktopRouter = ReturnType<
	typeof createChatMastraServiceRouter
>;
