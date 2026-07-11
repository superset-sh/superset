import {
	createSessionInput,
	getCatalogInput,
	getMessagesInput,
	getSessionInput,
	interruptSessionInput,
	listSessionsInput,
	respondToElicitationInput,
	respondToPermissionInput,
	respondToUserDialogInput,
	retrySessionInput,
	sendMessageInput,
	setModelInput,
	setPermissionModeInput,
} from "@superset/session-protocol";
import { TRPCError } from "@trpc/server";
import {
	SessionCursorError,
	SessionNotFoundError,
	SessionUnavailableError,
	SessionWorkspaceMismatchError,
} from "../../../runtime/sessions";
import { protectedProcedure, router } from "../../index";

function rethrowMapped(error: unknown): never {
	if (error instanceof SessionNotFoundError) {
		throw new TRPCError({ code: "NOT_FOUND", message: error.message });
	}
	if (error instanceof SessionUnavailableError) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: error.message,
		});
	}
	if (error instanceof SessionWorkspaceMismatchError) {
		throw new TRPCError({ code: "CONFLICT", message: error.message });
	}
	if (error instanceof SessionCursorError) {
		throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
	}
	throw error;
}

/**
 * Direct Claude Agent SDK session surface. Query handles and callbacks remain
 * host-local; this router mirrors the SDK's serializable controls.
 */
export const sessionsRouter = router({
	list: protectedProcedure.input(listSessionsInput).query(({ ctx, input }) => {
		try {
			return ctx.runtime.sessions.list(input);
		} catch (error) {
			rethrowMapped(error);
		}
	}),

	create: protectedProcedure
		.input(createSessionInput)
		.mutation(async ({ ctx, input }) => {
			try {
				return await ctx.runtime.sessions.create(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	retry: protectedProcedure
		.input(retrySessionInput)
		.mutation(async ({ ctx, input }) => {
			try {
				return await ctx.runtime.sessions.retry(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	get: protectedProcedure.input(getSessionInput).query(({ ctx, input }) => {
		try {
			return ctx.runtime.sessions.get(input);
		} catch (error) {
			rethrowMapped(error);
		}
	}),

	getMessages: protectedProcedure
		.input(getMessagesInput)
		.query(async ({ ctx, input }) => {
			try {
				return await ctx.runtime.sessions.getMessages(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	// Admission acknowledgement only. Completion arrives on streamed SDK/state frames.
	sendMessage: protectedProcedure
		.input(sendMessageInput)
		.mutation(({ ctx, input }) => {
			try {
				return ctx.runtime.sessions.sendMessage(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	respondToPermission: protectedProcedure
		.input(respondToPermissionInput)
		.mutation(({ ctx, input }) => {
			try {
				return ctx.runtime.sessions.respondToPermission(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	respondToUserDialog: protectedProcedure
		.input(respondToUserDialogInput)
		.mutation(({ ctx, input }) => {
			try {
				return ctx.runtime.sessions.respondToUserDialog(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	respondToElicitation: protectedProcedure
		.input(respondToElicitationInput)
		.mutation(({ ctx, input }) => {
			try {
				return ctx.runtime.sessions.respondToElicitation(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	interrupt: protectedProcedure
		.input(interruptSessionInput)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.runtime.sessions.interrupt(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	setModel: protectedProcedure
		.input(setModelInput)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.runtime.sessions.setModel(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	setPermissionMode: protectedProcedure
		.input(setPermissionModeInput)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.runtime.sessions.setPermissionMode(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),

	getCatalog: protectedProcedure
		.input(getCatalogInput)
		.query(({ ctx, input }) => {
			try {
				return ctx.runtime.sessions.getCatalog(input);
			} catch (error) {
				rethrowMapped(error);
			}
		}),
});
