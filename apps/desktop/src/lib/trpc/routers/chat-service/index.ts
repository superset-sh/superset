import {
	createChatServiceRouter as buildRouter,
	ChatService,
} from "@superset/chat/host";

export const chatService = new ChatService();

export const createChatServiceRouter = () => buildRouter(chatService);

export type ChatServiceDesktopRouter = ReturnType<
	typeof createChatServiceRouter
>;
