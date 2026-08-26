import { describe, expect, test } from "bun:test";
import { publishPageSchema } from "./schema";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const PAGE = "00000000-0000-4000-8000-000000000002";

const base = {
	content: Buffer.from("<!doctype html>").toString("base64"),
	contentType: "text/html",
	filename: "index.html",
};

describe("publishPageSchema", () => {
	test("rejects a publish anchored to nothing", () => {
		const result = publishPageSchema.safeParse(base);
		if (result.success) throw new Error("expected a validation failure");
		expect(result.error.issues[0]?.message).toBe(
			"A publish must name where it lives: pass workspaceId and entryPath, or pageId to add a version to an existing page",
		);
	});

	test("accepts a publish anchored by pageId alone", () => {
		expect(publishPageSchema.safeParse({ ...base, pageId: PAGE }).success).toBe(
			true,
		);
	});

	test("accepts pageId carrying a workspace id but no entry path", () => {
		expect(
			publishPageSchema.safeParse({
				...base,
				pageId: PAGE,
				workspaceId: WORKSPACE,
			}).success,
		).toBe(true);
	});

	test("accepts a publish carrying both link fields", () => {
		expect(
			publishPageSchema.safeParse({
				...base,
				workspaceId: WORKSPACE,
				entryPath: "site/index.html",
			}).success,
		).toBe(true);
	});

	test("rejects entryPath without workspaceId", () => {
		const result = publishPageSchema.safeParse({
			...base,
			entryPath: "site/index.html",
		});
		if (result.success) throw new Error("expected a validation failure");
		expect(result.error.issues[0]?.message).toBe(
			"workspaceId and entryPath must be provided together",
		);
	});

	test("rejects workspaceId without entryPath", () => {
		expect(
			publishPageSchema.safeParse({ ...base, workspaceId: WORKSPACE }).success,
		).toBe(false);
	});

	test("tolerates a stray entryPath once pageId anchors the publish", () => {
		expect(
			publishPageSchema.safeParse({
				...base,
				pageId: PAGE,
				entryPath: "site/index.html",
			}).success,
		).toBe(true);
	});
});
