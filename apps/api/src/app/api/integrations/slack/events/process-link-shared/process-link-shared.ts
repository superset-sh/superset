import type { EntityMetadata, LinkSharedEvent } from "@slack/types";
import { db } from "@superset/db/client";
import { type SelectConnection, tasks } from "@superset/db/schema";
import {
	accountConnection,
	connectionBotToken,
} from "@superset/trpc/connectors";
import { pagePreview } from "@superset/trpc/page-preview";
import { and, eq } from "drizzle-orm";
import { findSlackUserLink } from "../../lib/find-slack-user-link";
import { generateConnectUrl } from "../utils/generate-connect-url";
import {
	createPageWorkObject,
	parsePageSlugFromUrl,
} from "../utils/page-work-object";
import { createSlackClient } from "../utils/slack-client";
import {
	createTaskWorkObject,
	parseTaskSlugFromUrl,
} from "../utils/work-objects";

interface ProcessLinkSharedParams {
	event: LinkSharedEvent;
	teamId: string;
	eventId: string;
}

export async function processLinkShared({
	event,
	teamId,
	eventId,
}: ProcessLinkSharedParams): Promise<void> {
	console.log("[slack/process-link-shared] Processing links:", {
		eventId,
		teamId,
		linkCount: event.links.length,
	});

	const connection = await accountConnection("slack", teamId);

	if (!connection) {
		console.error(
			"[slack/process-link-shared] No connection found for team:",
			teamId,
		);
		return;
	}

	await unfurlLinks({
		connection,
		teamId,
		slackUserId: event.user,
		channel: event.channel,
		ts: event.message_ts,
		urls: event.links.map((link) => link.url),
	});
}

export interface UnfurlLinksParams {
	connection: SelectConnection;
	teamId: string;
	slackUserId: string;
	channel: string;
	ts: string;
	urls: string[];
}

/**
 * Tasks unfurl for the whole connected workspace. Pages unfurl as the poster:
 * a public page for anyone, anything narrower only once the poster has linked
 * a Superset account that can read it — and until then Slack asks them to.
 */
export async function unfurlLinks({
	connection,
	teamId,
	slackUserId,
	channel,
	ts,
	urls,
}: UnfurlLinksParams): Promise<void> {
	const organizationId = connection.organizationId;
	const entities: EntityMetadata[] = [];
	let pageAwaitingUser: string | undefined;

	const pageSlugs = new Map(
		urls.flatMap((url) => {
			const slug = parsePageSlugFromUrl(url);
			return slug ? [[url, slug] as const] : [];
		}),
	);
	const reader =
		pageSlugs.size > 0
			? await findSlackUserLink({ organizationId, slackUserId, teamId })
			: undefined;

	for (const url of urls) {
		const taskSlug = parseTaskSlugFromUrl(url);
		if (taskSlug) {
			const task = await db.query.tasks.findFirst({
				where: and(
					eq(tasks.organizationId, organizationId),
					eq(tasks.slug, taskSlug),
				),
				with: { status: true, assignee: true, creator: true },
			});
			// Must match the exact URL from the message for Slack to unfurl
			if (task)
				entities.push({ ...createTaskWorkObject(task), app_unfurl_url: url });
			continue;
		}

		const pageSlug = pageSlugs.get(url);
		if (!pageSlug) continue;

		const result = await pagePreview({
			slug: pageSlug,
			organizationId,
			userId: reader?.userId,
		});
		if (result.status === "readable") {
			entities.push({
				...createPageWorkObject(result.preview),
				app_unfurl_url: url,
			});
		} else if (result.status === "needs_user") {
			pageAwaitingUser ??= url;
		}
	}

	if (entities.length === 0 && !pageAwaitingUser) return;

	const slack = createSlackClient(await connectionBotToken(connection));

	if (entities.length > 0) {
		try {
			// Work Objects use `metadata` instead of the legacy `unfurls` field
			await slack.chat.unfurl({ channel, ts, metadata: { entities } });
		} catch (err) {
			console.error("[slack/process-link-shared] Failed to send unfurls:", err);
		}
	}

	if (pageAwaitingUser) {
		try {
			await slack.chat.unfurl({
				channel,
				ts,
				unfurls: {},
				user_auth_required: true,
				user_auth_message:
					"Connect your Superset account to preview the pages you share.",
				user_auth_url: generateConnectUrl({
					slackUserId,
					teamId,
					unfurl: { channel, ts, url: pageAwaitingUser },
				}),
			});
		} catch (err) {
			console.error(
				"[slack/process-link-shared] Failed to request account link:",
				err,
			);
		}
	}
}
