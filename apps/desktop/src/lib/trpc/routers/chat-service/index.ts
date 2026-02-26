import {
	createChatServiceRouter as buildRouter,
	ChatService,
} from "@superset/chat/host";
import { env } from "main/env.main";
import { getHashedDeviceId } from "main/lib/device-info";
import { loadToken } from "../auth/utils/auth-functions";

const service = new ChatService({
	deviceId: getHashedDeviceId(),
	apiUrl: env.NEXT_PUBLIC_API_URL,
	getHeaders: async () => {
		const { token } = await loadToken();
		const headers: Record<string, string> = {};
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}
		return headers;
	},
});

export const createChatServiceRouter = () => buildRouter(service);

export type ChatServiceDesktopRouter = ReturnType<
	typeof createChatServiceRouter
>;
