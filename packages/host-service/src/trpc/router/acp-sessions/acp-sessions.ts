import {
	cancelInput,
	createSessionInput,
	decodeMessagesCursor,
	getMessagesInput,
	getSessionInput,
	listSessionsInput,
	promptInput,
	respondToPermissionInput,
	setConfigOptionInput,
	setModeInput,
} from "@superset/session-protocol";
import { TRPCError } from "@trpc/server";
import {
	AcpSessionDeadError,
	AcpSessionNotFoundError,
	AcpWorkspaceMismatchError,
} from "../../../runtime/acp-sessions";
import { protectedProcedure, router } from "../../index";

/**
 * Every ACP procedure except `list` sits behind the pre-release feature gate
 * (see HostServiceRuntime.acpSessionsEnabled) — a disabled host rejects the
 * surface with PRECONDITION_FAILED instead of exposing half-shipped behavior.
 * `list` stays ungated and answers `enabled: false` so clients can feature-
 * detect from the call they already make, without an extra request or error.
 */
const gatedProcedure = protectedProcedure.use(({ ctx, next }) => {
	if (!ctx.runtime.acpSessionsEnabled) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"ACP sessions are disabled on this host (requires a canary build of the desktop app)",
		});
	}
	return next();
});

function rethrowMapped(error: unknown): never {
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
 * ACP session surface (docs/acp-sessions.md). Thin passthrough to
 * `ctx.runtime.acpSessions` — inputs come from `@superset/session-protocol`
 * so mobile and host validate against the same schemas. Fully parallel to the
 * mastra `chat` router, which stays untouched.
 */
export const acpSessionsRouter = router({
	list: protectedProcedure.input(listSessionsInput).query(({ ctx, input }) => {
		if (!ctx.runtime.acpSessionsEnabled) {
			return { items: [], nextCursor: null, enabled: false };
		}
		return ctx.runtime.acpSessions.list(input);
	}),

	create: gatedProcedure
		.input(createSessionInput)
		.mutation(async ({ ctx, input }) => {
			try {
				return await ctx.runtime.acpSessions.create(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	get: gatedProcedure.input(getSessionInput).query(({ ctx, input }) => {
		try {
			return ctx.runtime.acpSessions.get(input.sessionId);
		} catch (error) {
			rethrowMapped(error);
		}
	}),

	// Every live-path procedure below awaits ensureLive first: a session
	// persisted before a host restart is `offline` until something needs its
	// adapter, at which point the manager resurrects it via session/load.
	// `list` and `get` stay passive so browsing sessions spawns nothing.
	getMessages: gatedProcedure
		.input(getMessagesInput)
		.query(async ({ ctx, input }) => {
			let beforeSeq: number | undefined;
			if (input.cursor !== undefined) {
				const decoded = decodeMessagesCursor(input.cursor);
				if (decoded === null) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Invalid messages cursor: ${input.cursor}`,
					});
				}
				beforeSeq = decoded;
			}
			try {
				await ctx.runtime.acpSessions.ensureLive(input.sessionId);
				return ctx.runtime.acpSessions.getMessages({
					sessionId: input.sessionId,
					beforeSeq,
					limit: input.limit,
				});
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	// Acks admission only — turn progress and completion ride the WS stream.
	// Never await the turn here: it can block on human permission decisions
	// far beyond the relay's buffered-HTTP timeout.
	prompt: gatedProcedure.input(promptInput).mutation(async ({ ctx, input }) => {
		try {
			await ctx.runtime.acpSessions.ensureLive(input.sessionId);
			const { accepted } = ctx.runtime.acpSessions.prompt(input);
			return { accepted };
		} catch (error) {
			rethrowMapped(error);
		}
	}),

	respondToPermission: gatedProcedure
		.input(respondToPermissionInput)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.runtime.acpSessions.ensureLive(input.sessionId);
				return ctx.runtime.acpSessions.respondToPermission(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	cancel: gatedProcedure.input(cancelInput).mutation(async ({ ctx, input }) => {
		try {
			await ctx.runtime.acpSessions.ensureLive(input.sessionId);
			await ctx.runtime.acpSessions.cancel(input);
		} catch (error) {
			rethrowMapped(error);
		}
	}),

	setMode: gatedProcedure
		.input(setModeInput)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.runtime.acpSessions.ensureLive(input.sessionId);
				await ctx.runtime.acpSessions.setMode(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	setConfigOption: gatedProcedure
		.input(setConfigOptionInput)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.runtime.acpSessions.ensureLive(input.sessionId);
				await ctx.runtime.acpSessions.setConfigOption(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),
});
