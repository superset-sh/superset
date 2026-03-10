import { ChatMastraService } from "@superset/chat-mastra/server/trpc";
import { env } from "main/env.main";
import { loadToken } from "../auth/utils/auth-functions";
import { getAtlasMcpTools } from "../../../atlas-mcp-tools";

const service = new ChatMastraService({
	headers: async (): Promise<Record<string, string>> => {
		const { token } = await loadToken();
		if (token) return { Authorization: `Bearer ${token}` };
		return {};
	},
	apiUrl: env.NEXT_PUBLIC_API_URL,
	getExtraTools: async () => getAtlasMcpTools(),
});

export const createChatMastraServiceRouter = () => service.createRouter();

export type ChatMastraServiceDesktopRouter = ReturnType<
	typeof createChatMastraServiceRouter
>;
