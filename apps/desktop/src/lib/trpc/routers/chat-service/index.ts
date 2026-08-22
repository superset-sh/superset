import {
	createChatServiceRouter as buildRouter,
	ChatService,
} from "@superset/provider-auth/server";

export const chatService = new ChatService();

export const createChatServiceRouter = () => buildRouter(chatService);

export type ChatServiceDesktopRouter = ReturnType<
	typeof createChatServiceRouter
>;
