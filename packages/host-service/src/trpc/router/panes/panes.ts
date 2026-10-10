import { PANE_SPLIT_DIRECTIONS } from "@superset/shared/pane-layout-ops";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { terminalSessions } from "../../../db/schema";
import { PaneLayoutBridgeClient } from "../../../runtime/pane-layout-bridge/pane-layout-bridge-client";
import type { HostServiceContext } from "../../../types";
import { getLocalWorkspace } from "../../../workspaces/local-workspace-store";
import { protectedProcedure, router } from "../../index";

type PaneLayoutOp = Parameters<PaneLayoutBridgeClient["apply"]>[0]["op"];

const direction = z.enum(PANE_SPLIT_DIRECTIONS);
const paneInput = z.object({ workspaceId: z.string(), paneId: z.string() });

function applyOp(
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
	return new PaneLayoutBridgeClient(ctx.browserBridge).apply({
		workspaceId,
		op,
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
		.input(paneInput)
		.mutation(({ ctx, input }) =>
			applyOp(ctx, input.workspaceId, { type: "close", paneId: input.paneId }),
		),

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
