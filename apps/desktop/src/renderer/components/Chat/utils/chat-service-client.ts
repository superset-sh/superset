import { chatServiceTrpc } from "@superset/chat/client";
import type { TRPCLink } from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { sessionIdLink } from "renderer/lib/session-id-link";
import superjson from "superjson";
import { ipcLink } from "trpc-electron/renderer";

/** Prepends a router prefix to operation paths so a standalone-typed client can talk to a nested sub-router. */
function prefixLink<TRouter extends AnyRouter>(
	prefix: string,
): TRPCLink<TRouter> {
	return () =>
		({ op, next }) =>
			observable((observer) =>
				next({ ...op, path: `${prefix}.${op.path}` }).subscribe(observer),
			);
}

export function createChatServiceIpcClient() {
	return chatServiceTrpc.createClient({
		links: [
			prefixLink("chatService"),
			sessionIdLink(),
			ipcLink({ transformer: superjson }),
		],
	});
}
