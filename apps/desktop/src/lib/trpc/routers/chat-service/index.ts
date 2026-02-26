import {
	createChatServiceRouter as buildRouter,
	ChatService,
} from "@superset/chat/host";

const service = new ChatService();

export const createChatServiceRouter = () => buildRouter(service);

export type ChatServiceDesktopRouter = ReturnType<
	typeof createChatServiceRouter
>;
