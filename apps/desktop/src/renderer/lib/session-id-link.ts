import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "lib/trpc/routers";

/**
 * Global operation ID counter.
 *
 * Root cause: trpc-electron's ipcLink creates a new IPCClient for each tRPC client.
 * Each IPCClient registers its own message handler, and ALL handlers receive ALL
 * IPC responses. The handlers match responses by operation ID.
 *
 * Problem: Each tRPC client (React hooks client + proxy client for stores) generates
 * its own IDs starting from 1. When both clients have an operation with id=10,
 * a response for one can be incorrectly routed to the other.
 *
 * Solution: Replace operation IDs with globally unique IDs from a shared counter.
 * Starting from Date.now() ensures uniqueness across page refreshes.
 */
let globalOperationId = Date.now();

/**
 * Link that assigns globally unique operation IDs to prevent collisions
 * between multiple tRPC clients sharing the same IPC channel.
 */
export function sessionIdLink(): TRPCLink<AppRouter> {
	return () => {
		return ({ op, next }) => {
			const uniqueId = ++globalOperationId;

			return observable((observer) => {
				return next({
					...op,
					id: uniqueId,
				}).subscribe({
					next: (result) => observer.next(result),
					error: (err) => observer.error(err),
					complete: () => observer.complete(),
				});
			});
		};
	};
}
