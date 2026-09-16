import { db } from "@superset/db/client";
import { integrationConnections, subscriptions } from "@superset/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { posthog } from "@/lib/analytics";
import { findSlackUserLink } from "../../lib/find-slack-user-link";
import {
	claimAgentDelivery,
	finishAgentDelivery,
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
	beginThreadRun,
	finishThreadRun,
	parseThreadCommand,
	renderThreadMemory,
	setThreadQuiet,
	threadFollowUpsEnabled,
} from "../utils/thread-sessions";

import { splitMarkdown } from "./utils/split-markdown";

/** Everything after the claim — preflight, model calls, tools — shares this. */
const RUN_BUDGET_MS = 240_000;

const LOST_TRACK_TEXT =
	"I lost track of this request partway through. Anything listed as changed in this thread did happen; ask again for the rest.";
const QUIETED_TEXT =
	"Got it. I'll stay out of this thread unless someone mentions me.";
const UNQUIETED_TEXT = "Got it. I'll answer replies in this thread again.";

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
	const sessions = await threadFollowUpsEnabled(teamId);
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
	let placeholderTs: string | undefined;

	const showProgress = async (status: string) => {
		try {
			if (isDm) {
				await run.assistant.threads.setStatus({
					channel_id: event.channel,
					thread_ts: threadTs,
					status,
				});
			} else if (placeholderTs) {
				await run.chat.update({
					channel: event.channel,
					ts: placeholderTs,
					text: status,
				});
			} else {
				const posted = await run.chat.postMessage({
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
				await run.assistant.threads.setStatus({
					channel_id: event.channel,
					thread_ts: threadTs,
					status: "",
				});
			} else if (placeholderTs) {
				await run.chat.delete({ channel: event.channel, ts: placeholderTs });
				placeholderTs = undefined;
			}
		} catch {
			// Best-effort; a leftover placeholder is cosmetic.
		}
	};
	const removeEyes = async () => {
		try {
			await run.reactions.remove({
				channel: event.channel,
				timestamp: event.ts,
				name: "eyes",
			});
		} catch {}
	};

	// Claim before any work so a worker killed during preflight is still
	// recognised by the retry, and duplicate deliveries never replay tools.
	const claim = await claimAgentDelivery({
		teamId,
		channelId: event.channel,
		messageTs: event.ts,
	});
	if (claim.status === "duplicate") return;
	if (claim.status === "stale") {
		await run.chat.postMessage({
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
			await run.chat.postMessage({
				channel: event.channel,
				thread_ts: threadTs,
				text: command === "mute" ? QUIETED_TEXT : UNQUIETED_TEXT,
			});
			applied = true;
		} finally {
			await finishAgentDelivery(deliveryId, applied);
		}
		return;
	}
	let delivered = false;
	let actions: AgentAction[] = [];
	let threadSessionId: string | undefined;

	try {
		try {
			await run.reactions.add({
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

		const threadSession = sessions ? await beginThreadRun(threadKey) : null;
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
				run.chat.postMessage({
					channel: event.channel,
					thread_ts: threadTs,
					text,
					blocks: [{ type: "markdown", text }],
				});
			try {
				await post();
			} catch (error) {
				const wait = slackRateLimitRetryAfterMs(error);
				if (wait === undefined || Date.now() + wait >= deadline) throw error;
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
				await run.chat.postMessage({
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
		await run.chat.postMessage({
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
		}
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
