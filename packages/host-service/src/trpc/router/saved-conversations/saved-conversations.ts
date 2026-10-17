import { z } from "zod";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import { runAgentInWorkspace } from "../agents/agents";
import { checkpointDirectoryForDatabase } from "./history";
import {
	adoptNativeConversation,
	listSavedConversations,
	openSavedConversation,
	type SavedConversationDeps,
} from "./service";

const contextInput = z
	.object({
		workspaceId: z.string().min(1),
		agent: z.string().min(1),
		account: z
			.object({ selection: z.string().nullable(), identity: z.string().min(1) })
			.strict(),
	})
	.strict();

function dependencies(ctx: HostServiceContext): SavedConversationDeps {
	const dbPath = process.env.HOST_DB_PATH;
	return {
		db: ctx.db,
		runAgent: (input) => runAgentInWorkspace(ctx, input),
		checkpointDirectory: checkpointDirectoryForDatabase(dbPath),
	};
}

export const savedConversationsRouter = router({
	list: protectedProcedure
		.input(contextInput.extend({ cursor: z.uuid().optional() }).strict())
		.query(({ ctx, input }) =>
			listSavedConversations(dependencies(ctx), input),
		),
	adopt: protectedProcedure
		.input(
			contextInput
				.extend({
					nativeSessionId: z.uuid(),
					expectedRevision: z.string().length(64),
				})
				.strict(),
		)
		.mutation(({ ctx, input }) =>
			adoptNativeConversation(dependencies(ctx), input),
		),
	open: protectedProcedure
		.input(
			z
				.object({
					workspaceId: z.string().min(1),
					conversationId: z.uuid(),
					expectedRevision: z.string().length(64),
					originalSessionExited: z.boolean(),
				})
				.strict(),
		)
		.mutation(({ ctx, input }) =>
			openSavedConversation(dependencies(ctx), input),
		),
});
