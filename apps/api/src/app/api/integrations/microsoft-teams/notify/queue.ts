import { createHash } from "node:crypto";
import { Client } from "@upstash/qstash";
import { z } from "zod";

import { env } from "@/env";
import {
	changeNotificationSchema,
	lifecycleNotificationSchema,
} from "./notifications";

/**
 * Graph gives a notification endpoint three seconds to answer, and marks it
 * slow — then starts dropping — once a tenth of responses take longer. A
 * notification means a Graph GET, two writes and a QStash publish, which a
 * cold function will not fit in three seconds. So the notify and lifecycle
 * routes do only what proves the request is Graph's, hand the work to QStash
 * and answer 202; `process/route.ts` does the rest with retries.
 */

const qstash = new Client({
	token: env.QSTASH_TOKEN,
	baseUrl: env.QSTASH_URL,
});

export const PROCESS_PATH = "/api/integrations/microsoft-teams/process";
const PROCESS_URL = `${env.NEXT_PUBLIC_API_URL}${PROCESS_PATH}`;

export const teamsWorkSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("change"),
		connectionId: z.string().uuid(),
		notification: changeNotificationSchema,
	}),
	z.object({
		kind: z.literal("lifecycle"),
		connectionId: z.string().uuid(),
		notification: lifecycleNotificationSchema,
	}),
]);
export type TeamsWork = z.infer<typeof teamsWorkSchema>;

/**
 * One QStash message per notification. Change notifications dedupe on what
 * they point at, so a Graph redelivery inside the dedup window is dropped
 * before it costs a function; the `automation_events` unique index catches
 * anything that gets past.
 */
export async function enqueueTeamsWork(items: TeamsWork[]): Promise<void> {
	if (items.length === 0) return;
	await qstash.batchJSON(
		items.map((item) => ({
			url: PROCESS_URL,
			body: item,
			retries: 3,
			...(item.kind === "change"
				? {
						deduplicationId: createHash("sha256")
							.update(
								`${item.notification.subscriptionId}:${item.notification.changeType}:${item.notification.resource}`,
							)
							.digest("hex"),
					}
				: {}),
		})),
	);
}
