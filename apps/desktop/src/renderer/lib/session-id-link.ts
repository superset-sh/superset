import type { TRPCLink } from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import { observable } from "@trpc/server/observable";

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
export function sessionIdLink<TRouter extends AnyRouter>(): TRPCLink<TRouter> {
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
