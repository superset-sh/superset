import { createChatMastraServiceRouter as buildRouter } from "@superset/chat-mastra/server/trpc";
import { env } from "main/env.main";
import { loadToken } from "../auth/utils/auth-functions";

export const createChatMastraServiceRouter = () =>
	buildRouter({
		headers: async (): Promise<Record<string, string>> => {
			const { token } = await loadToken();
			if (!token) return {};
			return { Authorization: `Bearer ${token}` };
		},
		apiUrl: env.NEXT_PUBLIC_API_URL,
	});

export type ChatMastraServiceDesktopRouter = ReturnType<
	typeof createChatMastraServiceRouter
>;
