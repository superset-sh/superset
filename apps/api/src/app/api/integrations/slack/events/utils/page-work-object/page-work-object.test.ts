import { describe, expect, test } from "bun:test";
import type { PagePreview } from "@superset/trpc/page-preview";
import { createPageWorkObject, parsePageSlugFromUrl } from "./page-work-object";

function preview(overrides: Partial<PagePreview> = {}): PagePreview {
	return {
		id: "page-id",
		slug: "launch-plan-abc123",
		title: "Launch plan",
		description: "What ships and when.",
		url: "https://app.superset.sh/page/launch-plan-abc123",
		updatedAt: new Date("2026-09-24T12:00:00Z"),
		thumbnailUrl: "https://page.frame.example/versions/3/thumbnail.jpg?t=x",
		createdBy: { name: "Ada", email: "ada@example.com" },
		...overrides,
	};
}

describe("parsePageSlugFromUrl", () => {
	test("reads the slug from a page link", () => {
		expect(
			parsePageSlugFromUrl("https://app.superset.sh/page/launch-plan-abc123"),
		).toBe("launch-plan-abc123");
	});

	test("keeps the slug when the link carries a version or fragment", () => {
		expect(
			parsePageSlugFromUrl(
				"https://app.superset.sh/page/launch-plan-abc123/?v=2#top",
			),
		).toBe("launch-plan-abc123");
	});

	test("ignores links that are not pages", () => {
		expect(
			parsePageSlugFromUrl("https://app.superset.sh/tasks/abc"),
		).toBeNull();
		expect(parsePageSlugFromUrl("https://app.superset.sh/pages")).toBeNull();
		expect(parsePageSlugFromUrl("not a url")).toBeNull();
	});
});

describe("createPageWorkObject", () => {
	test("builds a content item with the thumbnail first", () => {
		const entity = createPageWorkObject(preview());

		expect(entity.entity_type).toBe("slack#/entities/content_item");
		expect(entity.url).toBe("https://app.superset.sh/page/launch-plan-abc123");
		expect(entity.external_ref).toEqual({ id: "page-id", type: "page" });
		expect(entity.entity_payload.attributes.title.text).toBe("Launch plan");
		expect(entity.entity_payload.display_order).toEqual([
			"preview",
			"description",
			"created_by",
			"date_updated",
		]);
		expect(entity.entity_payload.fields).toMatchObject({
			preview: {
				alt_text: "Launch plan",
				image_url: "https://page.frame.example/versions/3/thumbnail.jpg?t=x",
			},
			description: { value: "What ships and when." },
			created_by: { user: { text: "Ada", email: "ada@example.com" } },
			date_updated: { value: 1790251200 },
		});
	});

	test("leaves out what the page does not have", () => {
		const entity = createPageWorkObject(
			preview({ thumbnailUrl: null, description: null, createdBy: null }),
		);

		expect(entity.entity_payload.display_order).toEqual(["date_updated"]);
		expect(entity.entity_payload.fields).toEqual({
			date_updated: { value: 1790251200 },
		});
	});
});
