import { afterAll, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PAGE_THEME_CSS } from "@superset/shared/usercontent";
import { previewResponse, resolvePreviewSite } from "./servePreview";

const dir = mkdtempSync(join(tmpdir(), "pages-preview-"));
mkdirSync(join(dir, "site"));
writeFileSync(
	join(dir, "site", "index.html"),
	"<!doctype html><html><head><title>t</title></head><body></body></html>",
);
writeFileSync(join(dir, "site", "app.css"), "body{}");
writeFileSync(join(dir, "secret.txt"), "outside");
symlinkSync(join(dir, "secret.txt"), join(dir, "site", "linked.txt"));
const site = resolvePreviewSite(join(dir, "site"));
const singleFile = resolvePreviewSite(join(dir, "site", "index.html"));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("previewResponse", () => {
	test("serves the page with the injected theme under the published policy", async () => {
		const response = previewResponse(site, "/");
		expect(response.headers.get("content-security-policy")).toContain(
			"default-src 'none'",
		);
		expect(await response.text()).toContain(`<style>${PAGE_THEME_CSS}</style>`);
	});

	test("serves a directory's own assets untouched", async () => {
		const response = previewResponse(site, "/app.css");
		expect(response.headers.get("content-type")).toContain("text/css");
		expect(await response.text()).toBe("body{}");
	});

	test("refuses paths outside the page's directory, including through a link", () => {
		expect(previewResponse(site, "/../secret.txt").status).toBe(404);
		expect(previewResponse(site, "/%2e%2e/secret.txt").status).toBe(404);
		expect(previewResponse(site, "/linked.txt").status).toBe(404);
	});

	test("answers a malformed path with not found", () => {
		expect(previewResponse(site, "/%E0%A4%A").status).toBe(404);
	});

	test("serves no neighbouring files for a single-file page, as publishing uploads none", () => {
		expect(previewResponse(singleFile, "/").status).toBe(200);
		expect(previewResponse(singleFile, "/app.css").status).toBe(404);
	});

	test("serves an SVG opened directly as a download, as the published origin does", () => {
		writeFileSync(join(dir, "site", "logo.svg"), "<svg/>");
		const response = previewResponse(site, "/logo.svg", "document");
		expect(response.headers.get("content-disposition")).toContain("attachment");
		expect(
			previewResponse(site, "/logo.svg", "image").headers.get(
				"content-disposition",
			),
		).toBeNull();
	});
});
