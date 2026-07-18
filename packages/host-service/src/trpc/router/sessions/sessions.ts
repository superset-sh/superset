import {
	cancelTurnInputSchema,
	cancelTurnReceiptSchema,
	createSessionInputSchema,
	createSessionResultSchema,
	eventsWindowSchema,
	getEventsInputSchema,
	getSessionInputSchema,
	hostSnapshotSchema,
	resolvePermissionInputSchema,
	resolvePermissionReceiptSchema,
	resolveToolCallInputSchema,
	resolveToolCallReceiptSchema,
	sessionSnapshotSchema,
	submitTurnInputSchema,
	submitTurnReceiptSchema,
	updateSessionInputSchema,
	updateSessionReceiptSchema,
} from "@superset/host-service-sync/protocol";
import { TRPCError } from "@trpc/server";
import {
	AcpSessionDeadError,
	AcpSessionNotFoundError,
	AcpWorkspaceMismatchError,
} from "../../../runtime/acp-sessions";
import {
	CanonicalSessionsError,
	type CanonicalSessionsErrorCode,
} from "../../../runtime/sessions";
import { protectedProcedure, router } from "../../index";

/**
 * Same pre-release feature gate as the raw acpSessions router: the canonical
 * surface is a projection over the same adapter processes, so it ships behind
 * the same flag. `list` stays ungated and answers the empty host snapshot so
 * clients can probe without erroring.
 */
const gatedProcedure = protectedProcedure.use(({ ctx, next }) => {
	if (!ctx.runtime.acpSessionsEnabled) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"Host sessions are disabled on this host (requires a canary build of the desktop app)",
		});
	}
	return next();
});

type TrpcErrorCode = ConstructorParameters<typeof TRPCError>[0]["code"];

const CODE_MAP: Record<CanonicalSessionsErrorCode, TrpcErrorCode> = {
	NOT_FOUND: "NOT_FOUND",
	BAD_REQUEST: "BAD_REQUEST",
	NOT_IMPLEMENTED: "METHOD_NOT_SUPPORTED",
	PRECONDITION_FAILED: "PRECONDITION_FAILED",
	CONFLICT: "CONFLICT",
	INTERNAL: "INTERNAL_SERVER_ERROR",
};

function rethrowMapped(error: unknown): never {
	if (error instanceof CanonicalSessionsError) {
		throw new TRPCError({ code: CODE_MAP[error.code], message: error.message });
	}
	// The runtime lets manager errors escape untranslated (unknown session,
	// dead adapter, cross-workspace id reuse) — same mapping as acpSessions.
	if (error instanceof AcpSessionNotFoundError) {
		throw new TRPCError({ code: "NOT_FOUND", message: error.message });
	}
	if (error instanceof AcpSessionDeadError) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: error.message,
		});
	}
	if (error instanceof AcpWorkspaceMismatchError) {
		throw new TRPCError({ code: "CONFLICT", message: error.message });
	}
	throw error;
}

/**
 * Canonical Host Sessions surface (plans/host-sessions-sync.md) — the
 * agent-agnostic session/thread/event model that mobile and web sync against.
 * Inputs AND outputs are validated against the shared protocol schemas from
 * `@superset/host-service-sync`, so a host that drifts from the contract
 * fails loudly at the boundary instead of corrupting client stores.
 *
 * `list` and `get` ARE the snapshots: they carry the `head` cursor the sync
 * socket subscribes from. Mutations return admission receipts; completion
 * arrives as events whose causationId echoes the requestId.
 */
export const sessionsRouter = router({
	list: protectedProcedure.output(hostSnapshotSchema).query(({ ctx }) => {
		const hub = ctx.runtime.sessionsSyncHub;
		if (!ctx.runtime.acpSessionsEnabled || !hub) {
			return {
				sessions: [],
				pendingPermissions: [],
				openClientToolCalls: [],
				head: null,
			};
		}
		try {
			// Head first: an event folding between the two reads then lands in
			// both the snapshot and the replay, which host-event idempotence
			// absorbs — the reverse order could lose it.
			const head = hub.hostHead();
			return { ...ctx.runtime.sessions.hostSnapshotData(), head };
		} catch (error) {
			rethrowMapped(error);
		}
	}),

	create: gatedProcedure
		.input(createSessionInputSchema)
		.output(createSessionResultSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return await ctx.runtime.sessions.createSession(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	get: gatedProcedure
		.input(getSessionInputSchema)
		.output(sessionSnapshotSchema)
		.query(async ({ ctx, input }) => {
			try {
				return await ctx.runtime.sessions.getSession(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	update: gatedProcedure
		.input(updateSessionInputSchema)
		.output(updateSessionReceiptSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return await ctx.runtime.sessions.updateSession(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	getEvents: gatedProcedure
		.input(getEventsInputSchema)
		.output(eventsWindowSchema)
		.query(async ({ ctx, input }) => {
			try {
				return await ctx.runtime.sessions.getEvents(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	// Acks admission only — turn progress rides /sessions/sync. Never await
	// the turn here: it can block on human permission decisions far beyond
	// the relay's buffered-HTTP timeout.
	submitTurn: gatedProcedure
		.input(submitTurnInputSchema)
		.output(submitTurnReceiptSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return await ctx.runtime.sessions.submitTurn(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	cancelTurn: gatedProcedure
		.input(cancelTurnInputSchema)
		.output(cancelTurnReceiptSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return await ctx.runtime.sessions.cancelTurn(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	resolvePermission: gatedProcedure
		.input(resolvePermissionInputSchema)
		.output(resolvePermissionReceiptSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return await ctx.runtime.sessions.resolvePermission(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	// No claim step: any capable client answers; first write wins and later
	// resolves surface the host's stale error.
	resolveToolCall: gatedProcedure
		.input(resolveToolCallInputSchema)
		.output(resolveToolCallReceiptSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return await ctx.runtime.sessions.resolveToolCall(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),
});
