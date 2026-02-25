import { createChatMastraServiceRouter as buildRouter } from "@superset/chat-mastra/server/trpc";
import { env } from "main/env.main";
import { loadToken } from "../auth/utils/auth-functions";
export const createChatMastraServiceRouter = () =>
	buildRouter({
		streams: {
			apiBaseUrl: env.NEXT_PUBLIC_API_URL,
			routePrefix: "/api/chat",
			getHeaders: async () => {
				const { token } = await loadToken();
				const headers: Record<string, string> = {};
				if (token) {
					headers.Authorization = `Bearer ${token}`;
				}
				return headers;
			},
		},
	});

export type ChatMastraServiceDesktopRouter = ReturnType<
	typeof createChatMastraServiceRouter
>;
