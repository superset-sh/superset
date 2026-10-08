import { db } from "@superset/db/client";
import { pushDevices } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { sendExpoPush } from "../../lib/expo-push";
import { protectedProcedure } from "../../trpc";

const PREVIEW_MAX_LENGTH = 180;

const expoPushTokenSchema = z
	.string()
	.max(256)
	.regex(/^Expo(nent)?PushToken\[.+\]$/);

const agentEventSchema = z.object({
	event: z.enum(["stop", "permission"]),
	workspaceId: z.string().min(1).max(256),
	terminalId: z.string().min(1).max(256),
	workspaceName: z.string().max(256).optional(),
	preview: z.string().max(4000).optional(),
});

function agentEventBody(
	event: z.infer<typeof agentEventSchema>["event"],
	preview: string | undefined,
): string {
	if (event === "permission") return "Your agent needs your approval";
	const text = preview?.replace(/\s+/g, " ").trim();
	if (!text) return "Your agent finished";
	return text.length > PREVIEW_MAX_LENGTH
		? `${text.slice(0, PREVIEW_MAX_LENGTH - 1)}…`
		: text;
}

export const pushRouter = {
	registerDevice: protectedProcedure
		.input(
			z.object({
				token: expoPushTokenSchema,
				platform: z.enum(["ios", "android"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await db
				.insert(pushDevices)
				.values({
					userId: ctx.session.user.id,
					token: input.token,
					platform: input.platform,
				})
				.onConflictDoUpdate({
					target: pushDevices.token,
					set: {
						userId: ctx.session.user.id,
						platform: input.platform,
						updatedAt: new Date(),
					},
				});
		}),

	unregisterDevice: protectedProcedure
		.input(z.object({ token: z.string().max(256) }))
		.mutation(async ({ ctx, input }) => {
			await db
				.delete(pushDevices)
				.where(
					and(
						eq(pushDevices.token, input.token),
						eq(pushDevices.userId, ctx.session.user.id),
					),
				);
		}),

	notifyAgentEvent: protectedProcedure
		.input(agentEventSchema)
		.mutation(async ({ ctx, input }) => {
			const devices = await db.query.pushDevices.findMany({
				where: eq(pushDevices.userId, ctx.session.user.id),
				columns: { token: true },
			});
			if (devices.length === 0) return { sent: 0 };

			const title = input.workspaceName?.trim() || "Superset";
			const body = agentEventBody(input.event, input.preview);
			const dead = await sendExpoPush(
				devices.map(({ token }) => ({
					to: token,
					title,
					body,
					data: {
						event: input.event,
						workspaceId: input.workspaceId,
						terminalId: input.terminalId,
					},
				})),
			);
			if (dead.length > 0) {
				await db.delete(pushDevices).where(inArray(pushDevices.token, dead));
			}
			return { sent: devices.length - dead.length };
		}),
} satisfies TRPCRouterRecord;
