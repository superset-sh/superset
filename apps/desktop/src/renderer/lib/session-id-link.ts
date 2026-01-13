import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "lib/trpc/routers";

/**
 * Global counter for unique operation IDs across all tRPC clients.
 * Starts from Date.now() to ensure uniqueness across page refreshes.
 */
let globalOperationId = Date.now();

/**
 * Assigns globally unique operation IDs to prevent collisions between
 * the React client and proxy client (each creates separate IPCClients
 * that both receive all IPC responses and match by ID).
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
