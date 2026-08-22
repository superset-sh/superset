import {
	type CommentObjectResponse,
	type DataSourceObjectResponse,
	isFullComment,
	isFullDataSource,
	isFullPage,
	type PageObjectResponse,
	type PartialCommentObjectResponse,
	type PartialDataSourceObjectResponse,
	type PartialPageObjectResponse,
} from "@notionhq/client";
import type { NotionMatchableEvent } from "@superset/shared/automation-matching";
import {
	isPermanentNotionError,
	mentionedUserIds,
	notionClient,
	pageTitle,
	plainText,
} from "@superset/trpc/integrations/notion";
import { z } from "zod";

import type { NormalizedDelivery } from "@/lib/automations/ingestAutomationEvent";

/**
 * A Notion delivery names an entity and says what happened to it; it carries
 * none of the content. Everything a trigger filters on — which data source,
 * which page, who wrote it, who it mentions — is fetched here.
 */

export const notionWebhookEventSchema = z.object({
	id: z.string().min(1),
	timestamp: z.string(),
	workspace_id: z.string().min(1),
	workspace_name: z.string().nullish(),
	type: z.string().min(1),
	authors: z.array(z.object({ id: z.string(), type: z.string() })).optional(),
	attempt_number: z.number().optional(),
	entity: z.object({ id: z.string().min(1), type: z.string() }),
	data: z
		.looseObject({
			page_id: z.string().optional(),
			parent: z.object({ id: z.string(), type: z.string() }).optional(),
		})
		.optional(),
});
export type NotionWebhookEvent = z.infer<typeof notionWebhookEventSchema>;

/** The delivery types this provider turns into automation events. */
export const HANDLED_EVENT_TYPES = new Set([
	"comment.created",
	"data_source.content_updated",
]);

type FetchedNotionEvent = {
	dataSourceId: string | null;
	pageId: string | null;
	actorId: string | null;
	mentionedUserIds: string[];
	body: string | null;
	title: string;
	url: string | null;
	/** Runs debounce per subject; a page's comments are one subject. */
	resourceKey: string;
	/** The delivery plus what was fetched, kept for the run's prompt. */
	payload: {
		event: NotionWebhookEvent;
		comment?: CommentObjectResponse | PartialCommentObjectResponse;
		page?: PageObjectResponse | PartialPageObjectResponse;
		dataSource?: DataSourceObjectResponse | PartialDataSourceObjectResponse;
	};
};

function dataSourceOf(page: PageObjectResponse): string | null {
	const parent = page.parent;
	if (parent.type === "data_source_id") return parent.data_source_id;
	// Only older API versions answer with database_id; kept so a stale
	// response still attributes the row to something rather than nothing.
	if (parent.type === "database_id") return parent.database_id;
	return null;
}

/**
 * Fetches what the delivery points at. A partial object (the integration
 * lacks the content capability) still names the entity, so it is used for
 * what it carries rather than refused.
 */
async function fetchNotionEvent(
	accessToken: string,
	event: NotionWebhookEvent,
): Promise<FetchedNotionEvent> {
	const client = notionClient(accessToken);
	switch (event.type) {
		case "comment.created": {
			const comment = await client.comments.retrieve({
				comment_id: event.entity.id,
			});
			const full = isFullComment(comment) ? comment : null;
			// The delivery names the page; a block comment's own parent is the
			// block, so the page id has to come from the delivery when present.
			const pageId =
				event.data?.page_id ??
				(full?.parent.type === "page_id" ? full.parent.page_id : null);
			const page = pageId
				? await client.pages.retrieve({ page_id: pageId })
				: null;
			const fullPage = page && isFullPage(page) ? page : null;
			return {
				dataSourceId: fullPage ? dataSourceOf(fullPage) : null,
				pageId,
				actorId: full?.created_by.id ?? null,
				mentionedUserIds: mentionedUserIds(full?.rich_text),
				body: plainText(full?.rich_text) || null,
				title: (fullPage && pageTitle(fullPage)) || "Untitled",
				url: fullPage?.url ?? null,
				resourceKey: `notion:${pageId ?? comment.id}`,
				payload: { event, comment, ...(page ? { page } : {}) },
			};
		}
		case "data_source.content_updated": {
			const dataSource = await client.dataSources.retrieve({
				data_source_id: event.entity.id,
			});
			const full = isFullDataSource(dataSource) ? dataSource : null;
			return {
				dataSourceId: event.entity.id,
				pageId: null,
				actorId: event.authors?.[0]?.id ?? null,
				mentionedUserIds: [],
				body: null,
				title: plainText(full?.title) || "Untitled",
				url: full?.url ?? null,
				resourceKey: `notion:${event.entity.id}`,
				payload: { event, dataSource },
			};
		}
		default:
			throw new Error(`Unhandled Notion event type ${event.type}`);
	}
}

/**
 * Fetches and normalizes one delivery for one connection. A permanent Notion
 * refusal — the entity is not shared with this connection, or the token no
 * longer works — is a skip: retrying will not change it. Anything else throws
 * so the delivery is retried.
 */
export async function normalizeNotionDelivery(params: {
	organizationId: string;
	connectionId: string;
	accessToken: string;
	event: NotionWebhookEvent;
	webhookEventId: string;
}): Promise<NormalizedDelivery> {
	const { event } = params;
	let fetched: FetchedNotionEvent;
	try {
		fetched = await fetchNotionEvent(params.accessToken, event);
	} catch (error) {
		if (isPermanentNotionError(error)) {
			return { skip: `${error.status} ${error.code}: ${error.message}` };
		}
		throw error;
	}

	const matchable: NotionMatchableEvent = {
		provider: "notion",
		eventType: event.type,
		actorId: fetched.actorId,
		actorLogin: null,
		body: fetched.body,
		dataSourceId: fetched.dataSourceId,
		pageId: fetched.pageId,
		mentionedUserIds: fetched.mentionedUserIds,
	};
	return {
		event: {
			organizationId: params.organizationId,
			integrationConnectionId: params.connectionId,
			provider: "notion",
			eventType: event.type,
			// A redelivery of the same Notion event id is the same event.
			externalEventId: event.id,
			resourceKey: fetched.resourceKey,
			title: fetched.title,
			url: fetched.url,
			payload: fetched.payload,
			webhookEventId: params.webhookEventId,
		},
		dispatch: { event: matchable },
	};
}
