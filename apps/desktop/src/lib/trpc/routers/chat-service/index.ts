import {
	createChatServiceRouter as buildRouter,
	type ChatHostAuthProvider,
	ChatService,
} from "@superset/chat/host";
import { env } from "main/env.main";
import { getHashedDeviceId } from "main/lib/device-info";
import { loadToken } from "../auth/utils/auth-functions";

const authProvider: ChatHostAuthProvider = {
	async getHeaders(): Promise<Record<string, string>> {
		const { token } = await loadToken();
		return token ? { Authorization: `Bearer ${token}` } : {};
	},
};

const service = new ChatService({
	deviceId: getHashedDeviceId(),
	apiUrl: env.NEXT_PUBLIC_API_URL,
	authProvider,
});

export const createChatServiceRouter = () => buildRouter(service);

export type ChatServiceDesktopRouter = ReturnType<
	typeof createChatServiceRouter
>;
