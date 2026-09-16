import { db } from "@superset/db/client";
import { integrationConnections, subscriptions } from "@superset/db/schema";
import { Client as QStash } from "@upstash/qstash";
import { and, desc, eq, isNull } from "drizzle-orm";
import { env } from "@/env";
import { posthog } from "@/lib/analytics";
import { findSlackUserLink } from "../../lib/find-slack-user-link";
import {
	claimAgentDelivery,
	finishAgentDelivery,
	releaseAgentDelivery,
} from "../utils/agent-delivery";
import { generateConnectUrl } from "../utils/generate-connect-url";
import {
	formatErrorForSlack,
	resolveUserMentions,
	runSlackAgent,
	SlackAgentError,
} from "../utils/run-agent";
import {
	type AgentAction,
	formatSideEffectsMessage,
} from "../utils/slack-blocks";
import {
	createSlackClient,
	slackRateLimitRetryAfterMs,
} from "../utils/slack-client";
import {
	extractSlackImageAssets,
	formatSlackImageAssetError,
	SlackImageAssetError,
} from "../utils/slack-image-assets";
import {
	abandonHandBack,
	beginThreadRun,
	completeHandBack,
	finishThreadRun,
	parseThreadCommand,
	renderThreadMemory,
	setThreadQuiet,
	takeQueuedEvents,
	threadFollowUpsEnabled,
} from "../utils/thread-sessions";

import { splitMarkdown } from "./utils/split-markdown";

/** Everything after the claim — preflight, model calls, tools — shares this. */
const RUN_BUDGET_MS = 240_000;
const WORKER_FLAG_TIMEOUT_MS = 5_000;
/**
 * Room after the run budget for the final posts and the finally block;
 * with preflight before the budget starts this sits just under the job
 * route's 300s maxDuration.
 */
const REPLY_GRACE_MS = 45_000;

const LOST_TRACK_TEXT =
	"I lost track of this request partway through. Anything listed as changed in this thread did happen; ask again for the rest.";
const QUIETED_TEXT =
	"Got it. I'll stay out of this thread unless someone mentions me.";
const UNQUIETED_TEXT = "Got it. I'll answer replies in this thread again.";
const JOB_URLS = {
	mention: `${env.NEXT_PUBLIC_API_URL}/api/integrations/slack/jobs/process-mention`,
	assistant: `${env.NEXT_PUBLIC_API_URL}/api/integrations/slack/jobs/process-assistant-message`,
};

interface SlackEventFile {
	id: string;
	name?: string;
	mimetype?: string;
	size?: number;
	url_private?: string;
	url_private_download?: string;
}

export interface SlackAgentMessageEvent {
	type: "app_mention" | "message";
	channel_type?: "im" | "channel" | "group" | "mpim";
	user: string;
	text?: string;
	ts: string;
	channel: string;
	event_ts: string;
	thread_ts?: string;
	files?: SlackEventFile[];
	/** Older messages that waited in the queue behind this one; their 👀 is cleared with it. */
	queued_ts?: string[];
}

interface ProcessMentionParams {
	event: SlackAgentMessageEvent;
	teamId: string;
	eventId: string;
}

export async function processAgentMessage({
	event,
	teamId,
	eventId,
}: ProcessMentionParams): Promise<void> {
	console.log("[slack/process-agent-message] Processing mention:", {
		eventId,
		teamId,
		channel: event.channel,
		user: event.user,
	});

	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.provider, "slack"),
			eq(integrationConnections.externalOrgId, teamId),
			isNull(integrationConnections.disconnectedAt),
		),
		orderBy: [
			desc(integrationConnections.updatedAt),
			desc(integrationConnections.id),
		],
	});

	if (!connection) {
		console.error(
			"[slack/process-agent-message] No connection found for team:",
			teamId,
		);
		return;
	}

	const slack = createSlackClient(connection.accessToken);

	const [slackUserLink, activeSubscription] = await Promise.all([
		event.user
			? findSlackUserLink({
					organizationId: connection.organizationId,
					slackUserId: event.user,
					teamId,
				})
			: undefined,
		db.query.subscriptions.findFirst({
			where: and(
				eq(subscriptions.referenceId, connection.organizationId),
				eq(subscriptions.status, "active"),
			),
			columns: { id: true },
		}),
	]);

	if (!activeSubscription) {
		posthog.capture({
			distinctId: event.user,
			event: "slack_gated",
			properties: {
				reason: "no_subscription",
				team_id: teamId,
				$process_person_profile: false,
			},
		});
		await slack.chat.postMessage({
			channel: event.channel,
			thread_ts: event.thread_ts ?? event.ts,
			text: "The Superset Slack integration requires a Pro plan.",
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: "The Superset Slack integration requires a Pro plan.",
					},
				},
				{
					type: "actions",
					elements: [
						{
							type: "button",
							text: { type: "plain_text", text: "Upgrade to Pro", emoji: true },
							url: "https://app.superset.sh/settings/billing",
							style: "primary",
						},
					],
				},
			],
		});
		return;
	}

	if (!slackUserLink) {
		if (!event.user) return;
		posthog.capture({
			distinctId: event.user,
			event: "slack_gated",
			properties: {
				reason: "no_linked_account",
				team_id: teamId,
				$process_person_profile: false,
			},
		});
		const connectUrl = generateConnectUrl({
			slackUserId: event.user,
			teamId,
		});
		await slack.chat.postMessage({
			channel: event.channel,
			thread_ts: event.thread_ts ?? event.ts,
			text: "To use Superset, you need to link your Slack account first.",
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: "To use Superset, you need to link your Slack account first.",
					},
				},
				{
					type: "actions",
					elements: [
						{
							type: "button",
							text: {
								type: "plain_text",
								text: "Connect Account",
								emoji: true,
							},
							url: connectUrl,
							style: "primary",
						},
					],
				},
			],
		});
		return;
	}

	const threadTs = event.thread_ts ?? event.ts;
	const isDm = event.channel_type === "im";
	// Thread sessions (memory, quieting, follow-ups) are one feature; a team
	// without the flag runs the Phase 0 path untouched.
	// A hand-back was queued while the flag was on, so it does not re-ask;
	// the events route already answered Slack, so this worker can wait longer.
	const sessions =
		event.queued_ts !== undefined ||
		(await threadFollowUpsEnabled(teamId, {
			timeoutMs: WORKER_FLAG_TIMEOUT_MS,
		}));
	const threadKey = {
		organizationId: connection.organizationId,
		teamId,
		channelId: event.channel,
		threadTs,
		userId: slackUserLink.userId,
	};

	// A thread reply without a mention only reaches this worker through the
	// follow-up path, which the flag opened at enqueue time. It may have
	// closed since, and the unflagged path never runs the agent for one.
	const isFollowUp = event.type === "message" && !isDm;
	if (isFollowUp && !sessions) return;
	// Every DM already reaches the agent, so quieting means nothing there.
	const command =
		sessions && !isDm ? parseThreadCommand(event.text ?? "") : null;
	// assistant.threads.setStatus only works in assistant (DM) threads; Slack
	// answers method_not_supported_for_channel_type anywhere else. Channels get
	// a placeholder message that carries progress and is removed once the final
	// reply exists, so the thread ends with one notifying message.
	const deadline = Date.now() + RUN_BUDGET_MS;
	const run = createSlackClient(connection.accessToken, { deadline });
	// Replies, progress and cleanup outlive the run budget: a turn that spent
	// it all still has to post its outcome and take its placeholder and 👀
	// back, or the thread looks stuck.
	const replyDeadline = deadline + REPLY_GRACE_MS;
	const reply = createSlackClient(connection.accessToken, {
		deadline: replyDeadline,
	});
	let placeholderTs: string | undefined;

	const showProgress = async (status: string) => {
		try {
			if (isDm) {
				await reply.assistant.threads.setStatus({
					channel_id: event.channel,
					thread_ts: threadTs,
					status,
				});
			} else if (placeholderTs) {
				await reply.chat.update({
					channel: event.channel,
					ts: placeholderTs,
					text: status,
				});
			} else {
				const posted = await reply.chat.postMessage({
					channel: event.channel,
					thread_ts: threadTs,
					text: status,
				});
				placeholderTs = posted.ts;
			}
		} catch {
			// Progress is best-effort.
		}
	};
	const clearProgress = async () => {
		try {
			if (isDm) {
				await reply.assistant.threads.setStatus({
					channel_id: event.channel,
					thread_ts: threadTs,
					status: "",
				});
			} else if (placeholderTs) {
				await reply.chat.delete({ channel: event.channel, ts: placeholderTs });
				placeholderTs = undefined;
			}
		} catch {
			// Best-effort; a leftover placeholder is cosmetic.
		}
	};
	const removeEyes = async () => {
		for (const timestamp of [event.ts, ...(event.queued_ts ?? [])]) {
			try {
				await reply.reactions.remove({
					channel: event.channel,
					timestamp,
					name: "eyes",
				});
			} catch {}
		}
	};

	// Claim before any work so a worker killed during preflight is still
	// recognised by the retry, and duplicate deliveries never replay tools.
	const claim = await claimAgentDelivery({
		teamId,
		channelId: event.channel,
		messageTs: event.ts,
		handoff: event.queued_ts ? eventId : undefined,
	});
	if (claim.status === "duplicate") return;
	if (claim.status === "stale") {
		await reply.chat.postMessage({
			channel: event.channel,
			thread_ts: threadTs,
			text: LOST_TRACK_TEXT,
		});
		await clearProgress();
		await removeEyes();
		return;
	}
	const deliveryId = claim.id;
	if (command) {
		let applied = false;
		try {
			await setThreadQuiet({ ...threadKey, quiet: command === "mute" });
			await reply.chat.postMessage({
				channel: event.channel,
				thread_ts: threadTs,
				text: command === "mute" ? QUIETED_TEXT : UNQUIETED_TEXT,
			});
			applied = true;
		} finally {
			await finishAgentDelivery(deliveryId, applied);
			await removeEyes();
		}
		return;
	}
	let delivered = false;
	let queued = false;
	let actions: AgentAction[] = [];
	let threadSessionId: string | undefined;

	try {
		try {
			await reply.reactions.add({
				channel: event.channel,
				timestamp: event.ts,
				name: "eyes",
			});
		} catch (err) {
			console.warn(
				"[slack/process-agent-message] Failed to add reaction:",
				err,
			);
		}
		await showProgress("Thinking...");

		const imageAssets = await extractSlackImageAssets({
			eventFiles: event.files,
			slack: run,
			slackToken: connection.accessToken,
			deadline,
		});

		const resolve = await resolveUserMentions({
			texts: [event.text ?? ""],
			slack: run,
		});

		const claimedThread = sessions
			? await beginThreadRun({
					...threadKey,
					event: {
						ts: event.ts,
						user: event.user,
						text: event.text ?? "",
						files: event.files,
					},
					handBack: event.queued_ts !== undefined,
				})
			: null;
		if (claimedThread?.status === "covered") {
			delivered = true;
			return;
		}
		if (claimedThread?.status === "queued") {
			// The running turn hands this back when it finishes; the 👀 stays
			// on the message until that later turn clears it.
			queued = true;
			await releaseAgentDelivery(deliveryId);
			await clearProgress();
			return;
		}
		const threadSession = claimedThread?.session ?? null;
		threadSessionId = threadSession?.id;

		const result = await runSlackAgent({
			prompt: resolve(event.text ?? ""),
			channelId: event.channel,
			threadTs,
			messageTs: event.ts,
			organizationId: connection.organizationId,
			userId: slackUserLink.userId,
			slackToken: connection.accessToken,
			model: slackUserLink.modelPreference ?? undefined,
			images: imageAssets,
			deadline,
			...(threadSession
				? {
						threadMemory: renderThreadMemory(threadSession.entityLog),
						lastContextTs: threadSession.lastContextTs ?? undefined,
						...(isDm
							? {}
							: {
									threadQuiet: {
										quiet: threadSession.quiet,
										set: (quiet: boolean) =>
											setThreadQuiet({ ...threadKey, quiet }),
									},
								}),
					}
				: {}),
			onProgress: showProgress,
		});
		actions = result.actions;

		// A new final reply notifies thread participants; editing a placeholder
		// silently would not. Model output goes in Slack's Markdown block.
		for (const text of splitMarkdown(result.text)) {
			const post = () =>
				reply.chat.postMessage({
					channel: event.channel,
					thread_ts: threadTs,
					text,
					blocks: [{ type: "markdown", text }],
				});
			try {
				await post();
			} catch (error) {
				const wait = slackRateLimitRetryAfterMs(error);
				if (wait === undefined || Date.now() + wait >= replyDeadline) {
					throw error;
				}
				await new Promise((resolve) => setTimeout(resolve, wait));
				await post();
			}
		}
		delivered = true;

		posthog.capture({
			distinctId: slackUserLink.userId,
			event: "slack_message_sent",
			properties: {
				type: event.type === "app_mention" ? "mention" : "dm",
				model: slackUserLink.modelPreference ?? undefined,
				tools_used: result.actions.map((a) => a.type),
				actions: result.actions.map((a) => a.type),
			},
		});

		// Post side effects as a separate message
		if (result.actions.length > 0) {
			try {
				await reply.chat.postMessage({
					channel: event.channel,
					thread_ts: threadTs,
					text: formatSideEffectsMessage(result.actions),
				});
			} catch (err) {
				console.error(
					"[slack/process-agent-message] Failed to post side effects:",
					err,
				);
			}
		}
	} catch (err) {
		console.error("[slack/process-agent-message] Agent error:", err);

		const errorText =
			err instanceof SlackImageAssetError
				? formatSlackImageAssetError(err)
				: err instanceof SlackAgentError
					? err.message
					: await formatErrorForSlack(err, deadline);
		await reply.chat.postMessage({
			channel: event.channel,
			thread_ts: threadTs,
			text: errorText,
		});
	} finally {
		if (threadSessionId) {
			try {
				await finishThreadRun({
					id: threadSessionId,
					actions,
					lastContextTs: event.ts,
				});
			} catch (error) {
				console.error(
					"[slack/process-agent-message] Failed to finish thread session",
					error,
				);
			}
			try {
				await handBackQueued({ threadSessionId, teamId, event });
			} catch (error) {
				console.error(
					"[slack/process-agent-message] Failed to hand back queued replies",
					error,
				);
			}
		}
		if (!queued) {
			try {
				await finishAgentDelivery(deliveryId, delivered);
			} catch (error) {
				console.error(
					"[slack/process-agent-message] Failed to finish delivery",
					error,
				);
			}
			await clearProgress();
			await removeEyes();
		}
	}
}

/**
 * Re-deliver the newest message that arrived during the turn. Its own job
 * takes the thread, reads the whole thread including the older queued
 * messages, and clears their reactions. The queue is cleared only after
 * QStash has the job, so a failed publish leaves it for the next turn.
 */
async function handBackQueued({
	threadSessionId,
	teamId,
	event,
}: {
	threadSessionId: string;
	teamId: string;
	event: SlackAgentMessageEvent;
}): Promise<void> {
	// One id per hand-off, not per message: the same reply can be handed
	// back again if another turn takes the thread before its job arrives,
	// and QStash would swallow a repeat of the first id for ten minutes.
	// QStash rejects a deduplication id containing ":" with a 400, which is
	// what silently lost the first queued reply in production.
	const handoffId = `queued-${teamId}-${event.ts.replace(".", "-")}`;
	const pending = await takeQueuedEvents(threadSessionId, handoffId);
	const newest = pending.at(-1);
	if (!newest) return;
	const isDm = event.channel_type === "im";
	const files = pending.flatMap((e) => e.files ?? []);
	const qstash = new QStash({ token: env.QSTASH_TOKEN });
	try {
		await publishHandBack({
			qstash,
			isDm,
			event,
			teamId,
			pending,
			newest,
			handoffId,
			files,
		});
	} catch (error) {
		await abandonHandBack(threadSessionId, handoffId);
		throw error;
	}
	await completeHandBack(threadSessionId, handoffId);
	console.log("[slack/process-agent-message] Handed back queued replies:", {
		handoffId,
		count: pending.length,
	});
}

async function publishHandBack({
	qstash,
	isDm,
	event,
	teamId,
	pending,
	newest,
	handoffId,
	files,
}: {
	qstash: QStash;
	isDm: boolean;
	event: SlackAgentMessageEvent;
	teamId: string;
	pending: { ts: string; user: string; text: string }[];
	newest: { ts: string; user: string; text: string };
	handoffId: string;
	files: SlackEventFile[];
}): Promise<void> {
	await qstash.publishJSON({
		url: isDm ? JOB_URLS.assistant : JOB_URLS.mention,
		body: {
			event: {
				type: "message",
				channel_type: isDm ? "im" : "channel",
				user: newest.user,
				text: newest.text,
				ts: newest.ts,
				channel: event.channel,
				event_ts: newest.ts,
				thread_ts: event.thread_ts ?? event.ts,
				queued_ts: pending.slice(0, -1).map((e) => e.ts),
				...(files.length > 0 ? { files } : {}),
			},
			teamId,
			eventId: handoffId,
		},
		deduplicationId: handoffId,
		retries: 3,
	});
}
