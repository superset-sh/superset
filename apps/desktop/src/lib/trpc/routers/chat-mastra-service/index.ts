import { createChatMastraServiceRouter as buildRouter } from "@superset/chat-mastra/server/trpc";

export const createChatMastraServiceRouter = () => buildRouter();

export type ChatMastraServiceDesktopRouter = ReturnType<
	typeof createChatMastraServiceRouter
>;
