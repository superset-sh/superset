/** @see https://docs.slack.dev/messaging/work-objects/ */

import type {
	ContentItemEntityFields,
	EntityMetadata,
	EntityType,
} from "@slack/types";
import type { PagePreview } from "@superset/trpc/page-preview";

const SUPERSET_PRODUCT_NAME = "Superset";

export function parsePageSlugFromUrl(url: string): string | null {
	try {
		return new URL(url).pathname.match(/^\/page\/([^/]+)/)?.[1] ?? null;
	} catch {
		return null;
	}
}

export function createPageWorkObject(page: PagePreview): EntityMetadata {
	const fields: ContentItemEntityFields = {};
	const displayOrder: string[] = [];
	const updatedAt = Math.floor(page.updatedAt.getTime() / 1000);

	if (page.thumbnailUrl) {
		fields.preview = { alt_text: page.title, image_url: page.thumbnailUrl };
		displayOrder.push("preview");
	}

	if (page.description) {
		fields.description = { value: page.description };
		displayOrder.push("description");
	}

	if (page.createdBy) {
		fields.created_by = {
			type: "slack#/types/user",
			user: { text: page.createdBy.name, email: page.createdBy.email },
		};
		displayOrder.push("created_by");
	}

	fields.date_updated = { value: updatedAt };
	displayOrder.push("date_updated");

	return {
		entity_type: "slack#/entities/content_item" as EntityType,
		url: page.url,
		app_unfurl_url: page.url,
		external_ref: { id: page.id, type: "page" },
		entity_payload: {
			attributes: {
				title: { text: page.title },
				display_type: "Page",
				product_name: SUPERSET_PRODUCT_NAME,
				full_size_preview: { is_supported: false },
				metadata_last_modified: updatedAt,
			},
			fields,
			display_order: displayOrder,
		},
	};
}
