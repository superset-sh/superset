import { observable } from "@trpc/server/observable";
import {
	type AnnotationSubmission,
	browserManager,
} from "main/lib/browser/browser-manager";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	formatAnnotationPrompt,
	formatSingleAnnotationPrompt,
} from "./utils/formatAnnotationPrompt";

export interface SingleAnnotationEvent {
	annotation: Record<string, unknown>;
	pageUrl: string;
}

export const createAnnotationRouter = () => {
	return router({
		inject: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(async ({ input }) => {
				await browserManager.injectAnnotationOverlay(input.paneId);
				return { success: true };
			}),

		remove: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.mutation(async ({ input }) => {
				await browserManager.removeAnnotationOverlay(input.paneId);
				return { success: true };
			}),

		getAnnotations: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.query(async ({ input }) => {
				const annotations = await browserManager.getAnnotations(input.paneId);
				return { annotations };
			}),

		onAnnotationsSubmitted: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(({ input }) => {
				return observable<AnnotationSubmission>((emit) => {
					const handler = (data: AnnotationSubmission) => {
						emit.next(data);
					};
					browserManager.on(`annotations:submitted:${input.paneId}`, handler);
					return () => {
						browserManager.off(
							`annotations:submitted:${input.paneId}`,
							handler,
						);
					};
				});
			}),

		onAnnotationAdded: publicProcedure
			.input(z.object({ paneId: z.string() }))
			.subscription(({ input }) => {
				return observable<SingleAnnotationEvent>((emit) => {
					const handler = (data: SingleAnnotationEvent) => {
						emit.next(data);
					};
					browserManager.on(`annotation:added:${input.paneId}`, handler);
					return () => {
						browserManager.off(`annotation:added:${input.paneId}`, handler);
					};
				});
			}),

		formatPrompt: publicProcedure
			.input(
				z.object({
					output: z.string(),
					pageUrl: z.string(),
					additionalContext: z.string().optional(),
					agent: z.enum(["claude", "codex"]).optional(),
				}),
			)
			.mutation(({ input }) => {
				const command = formatAnnotationPrompt({
					output: input.output,
					pageUrl: input.pageUrl,
					additionalContext: input.additionalContext,
					agent: input.agent,
				});
				return { command };
			}),

		formatSinglePrompt: publicProcedure
			.input(
				z.object({
					annotation: z.record(z.unknown()),
					pageUrl: z.string(),
					agent: z.enum(["claude", "codex"]).optional(),
				}),
			)
			.mutation(({ input }) => {
				const command = formatSingleAnnotationPrompt({
					annotation: input.annotation,
					pageUrl: input.pageUrl,
					agent: input.agent,
				});
				return { command };
			}),
	});
};
