import { PANE_SPLIT_DIRECTIONS } from "@superset/shared/pane-layout-ops";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { terminalSessions } from "../../../db/schema";
import { PaneLayoutBridgeClient } from "../../../runtime/pane-layout-bridge/pane-layout-bridge-client";
import { listTerminalSessions } from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import { getLocalWorkspace } from "../../../workspaces/local-workspace-store";
import { createCallerFactory, protectedProcedure, router } from "../../index";
import { terminalRouter } from "../terminal";
import { addPaneDetails } from "./add-pane-details";

const createTerminalCaller = createCallerFactory(terminalRouter);

type PaneLayoutOp = Parameters<PaneLayoutBridgeClient["apply"]>[0]["op"];

const direction = z.enum(PANE_SPLIT_DIRECTIONS);
const paneInput = z.object({ workspaceId: z.string(), paneId: z.string() });

async function applyOp(
	ctx: HostServiceContext,
	workspaceId: string,
	op: PaneLayoutOp,
) {
	if (!ctx.browserBridge) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"This host has no pane layout to edit (no desktop app is attached to it).",
		});
	}
	if (!getLocalWorkspace(ctx.db, workspaceId)) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
	}
	const result = await new PaneLayoutBridgeClient(ctx.browserBridge).apply({
		workspaceId,
		op,
	});
	return addPaneDetails(result, {
		titles: new Map(
			listTerminalSessions({ workspaceId }).map((session) => [
				session.terminalId,
				session.title,
			]),
		),
		agents: new Map(
			ctx.terminalAgentStore
				.listByWorkspace(workspaceId)
				.map((binding) => [binding.terminalId, binding]),
		),
	});
}

function requireWorkspaceTerminal(
	ctx: HostServiceContext,
	workspaceId: string,
	terminalId: string,
) {
	const session = ctx.db.query.terminalSessions
		.findFirst({ where: eq(terminalSessions.id, terminalId) })
		.sync();
	if (!session) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `No terminal session ${terminalId} on this host`,
		});
	}
	if (session.originWorkspaceId && session.originWorkspaceId !== workspaceId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Terminal ${terminalId} belongs to another workspace`,
		});
	}
}

export const panesRouter = router({
	list: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(({ ctx, input }) =>
			applyOp(ctx, input.workspaceId, { type: "list" }),
		),

	split: protectedProcedure
		.input(paneInput.extend({ direction, terminalId: z.string().min(1) }))
		.mutation(({ ctx, input }) => {
			requireWorkspaceTerminal(ctx, input.workspaceId, input.terminalId);
			return applyOp(ctx, input.workspaceId, {
				type: "split",
				paneId: input.paneId,
				direction: input.direction,
				terminalId: input.terminalId,
			});
		}),

	newTab: protectedProcedure
		.input(z.object({ workspaceId: z.string(), terminalId: z.string().min(1) }))
		.mutation(({ ctx, input }) => {
			requireWorkspaceTerminal(ctx, input.workspaceId, input.terminalId);
			return applyOp(ctx, input.workspaceId, {
				type: "newTab",
				terminalId: input.terminalId,
			});
		}),

	resize: protectedProcedure
		.input(paneInput.extend({ ratio: z.number().gt(0).lt(1) }))
		.mutation(({ ctx, input }) =>
			applyOp(ctx, input.workspaceId, {
				type: "resize",
				paneId: input.paneId,
				ratio: input.ratio,
			}),
		),

	equalize: protectedProcedure
		.input(z.object({ workspaceId: z.string(), tabId: z.string().optional() }))
		.mutation(({ ctx, input }) =>
			applyOp(ctx, input.workspaceId, {
				type: "equalize",
				tabId: input.tabId,
			}),
		),

	focus: protectedProcedure
		.input(paneInput)
		.mutation(({ ctx, input }) =>
			applyOp(ctx, input.workspaceId, { type: "focus", paneId: input.paneId }),
		),

	close: protectedProcedure
		.input(paneInput.extend({ keepTerminal: z.boolean().default(false) }))
		.mutation(async ({ ctx, input }) => {
			const before = await applyOp(ctx, input.workspaceId, { type: "list" });
			const terminalId = before.layout.tabs
				.flatMap((tab) => tab.panes)
				.find((pane) => pane.id === input.paneId)?.terminalId;
			const result = await applyOp(ctx, input.workspaceId, {
				type: "close",
				paneId: input.paneId,
				keepTerminal: input.keepTerminal,
			});
			// A live terminal left without a pane is re-adopted into a new tab
			// by the desktop, so closing ends it unless it was backgrounded.
			if (terminalId && !input.keepTerminal) {
				await createTerminalCaller(ctx).killSession({
					workspaceId: input.workspaceId,
					terminalId,
				});
			}
			return { ...result, terminalId: terminalId ?? null };
		}),

	move: protectedProcedure
		.input(paneInput.extend({ targetPaneId: z.string(), direction }))
		.mutation(({ ctx, input }) =>
			applyOp(ctx, input.workspaceId, {
				type: "move",
				paneId: input.paneId,
				targetPaneId: input.targetPaneId,
				direction: input.direction,
			}),
		),

	moveToNewTab: protectedProcedure.input(paneInput).mutation(({ ctx, input }) =>
		applyOp(ctx, input.workspaceId, {
			type: "moveToNewTab",
			paneId: input.paneId,
		}),
	),

	swap: protectedProcedure
		.input(paneInput.extend({ withPaneId: z.string() }))
		.mutation(({ ctx, input }) =>
			applyOp(ctx, input.workspaceId, {
				type: "swap",
				paneId: input.paneId,
				withPaneId: input.withPaneId,
			}),
		),
});
