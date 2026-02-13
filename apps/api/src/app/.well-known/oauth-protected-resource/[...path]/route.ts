import { protectedResourceHandler } from "mcp-handler";
import { env } from "@/env";

export const GET = protectedResourceHandler({
	authServerUrls: [env.NEXT_PUBLIC_API_URL],
	resourceUrl: env.NEXT_PUBLIC_API_URL,
});
