import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { BrowserBridgeClient } from "../../../runtime/browser-bridge/browser-bridge-client";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";

function requireBridge(ctx: HostServiceContext): BrowserBridgeClient {
	if (!ctx.browserBridge) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"This host has no browser panes (no desktop app is attached to it).",
		});
	}
	return new BrowserBridgeClient(ctx.browserBridge);
}

export const browserRouter = router({
	list: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(({ ctx, input }) => requireBridge(ctx).listPanes(input.workspaceId)),

	open: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				url: z.string(),
				target: z.enum(["current-tab", "new-tab"]).default("current-tab"),
			}),
		)
		.mutation(({ ctx, input }) =>
			requireBridge(ctx).open({
				workspaceId: input.workspaceId,
				url: input.url,
				target: input.target,
			}),
		),

	navigate: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				paneId: z.string(),
				url: z.string(),
			}),
		)
		.mutation(({ ctx, input }) =>
			requireBridge(ctx).navigate(input.workspaceId, input.paneId, input.url),
		),

	reload: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				paneId: z.string(),
				hard: z.boolean().default(false),
			}),
		)
		.mutation(({ ctx, input }) =>
			requireBridge(ctx).reload(input.workspaceId, input.paneId, input.hard),
		),

	screenshot: protectedProcedure
		.input(z.object({ workspaceId: z.string(), paneId: z.string() }))
		.mutation(({ ctx, input }) =>
			requireBridge(ctx).screenshot(input.workspaceId, input.paneId),
		),

	eval: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				paneId: z.string(),
				// Bound eval size — matches the bridge's HTTP body limit.
				code: z.string().max(1_000_000),
			}),
		)
		.mutation(({ ctx, input }) =>
			requireBridge(ctx).evaluate(input.workspaceId, input.paneId, input.code),
		),

	console: protectedProcedure
		.input(z.object({ workspaceId: z.string(), paneId: z.string() }))
		.query(({ ctx, input }) =>
			requireBridge(ctx).console(input.workspaceId, input.paneId),
		),

	importSources: protectedProcedure.query(({ ctx }) =>
		requireBridge(ctx).importSources(),
	),

	importCookies: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				paneId: z.string(),
				sourceId: z.string(),
			}),
		)
		.mutation(({ ctx, input }) =>
			requireBridge(ctx).importCookies(
				input.workspaceId,
				input.paneId,
				input.sourceId,
			),
		),
});
