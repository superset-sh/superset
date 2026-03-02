import { createChatMastraServiceClient } from "@superset/chat-mastra/client";
import type { ChatMastraServiceRouter } from "@superset/chat-mastra/server/trpc";
import type { TRPCLink } from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { sessionIdLink } from "renderer/lib/session-id-link";
import superjson from "superjson";
import { ipcLink } from "trpc-electron/renderer";

/** Prepends a router prefix so a standalone client can call a nested Electron router. */
function prefixLink<TRouter extends AnyRouter>(
	prefix: string,
): TRPCLink<TRouter> {
	return () =>
		({ op, next }) =>
			observable((observer) =>
				next({ ...op, path: `${prefix}.${op.path}` }).subscribe(observer),
			);
}

export function createChatMastraServiceIpcClient() {
	return createChatMastraServiceClient({
		links: [
			prefixLink<ChatMastraServiceRouter>("chatMastraService"),
			sessionIdLink(),
			ipcLink({ transformer: superjson }),
		],
	});
}
