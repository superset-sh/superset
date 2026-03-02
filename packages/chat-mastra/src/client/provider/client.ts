import { httpBatchLink, type TRPCLink } from "@trpc/client";
import superjson from "superjson";
import type { ChatMastraServiceRouter } from "../../server/trpc";
import {
	type ChatMastraServiceClient,
	chatMastraServiceTrpc,
} from "./provider";

export interface CreateChatMastraServiceClientOptions {
	links: TRPCLink<ChatMastraServiceRouter>[];
}

export interface CreateChatMastraServiceHttpClientOptions {
	url: string;
	headers?:
		| Record<string, string>
		| (() => Record<string, string> | Promise<Record<string, string>>);
	fetch?: typeof fetch;
}

export function createChatMastraServiceClient({
	links,
}: CreateChatMastraServiceClientOptions): ChatMastraServiceClient {
	return chatMastraServiceTrpc.createClient({ links });
}

export function createChatMastraServiceHttpClient({
	url,
	headers,
	fetch,
}: CreateChatMastraServiceHttpClientOptions): ChatMastraServiceClient {
	return createChatMastraServiceClient({
		links: [
			httpBatchLink({
				url,
				transformer: superjson,
				headers,
				...(fetch ? { fetch } : {}),
			}),
		],
	});
}
