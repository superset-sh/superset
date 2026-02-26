import { createChatMastraServiceRouter as buildRouter } from "@superset/chat-mastra/server/trpc";
import { loadToken } from "../auth/utils/auth-functions";

export const createChatMastraServiceRouter = () =>
	buildRouter({
		getAuthToken: async () => {
			const { token } = await loadToken();
			return token;
		},
	});

export type ChatMastraServiceDesktopRouter = ReturnType<
	typeof createChatMastraServiceRouter
>;
