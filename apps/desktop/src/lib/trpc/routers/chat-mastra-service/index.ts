import {
	createChatMastraServiceRouter as buildRouter,
	type CreateChatMastraServiceRouterOptions,
} from "@superset/chat-mastra/server/trpc";

export const createChatMastraServiceRouter = (
	options?: CreateChatMastraServiceRouterOptions,
) => buildRouter(options);

export type ChatMastraServiceDesktopRouter = ReturnType<
	typeof createChatMastraServiceRouter
>;
