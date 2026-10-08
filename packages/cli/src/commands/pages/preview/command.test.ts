import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PAGE_THEME_CSS } from "@superset/shared/usercontent";
import { previewResponse, resolvePreviewSite } from "./command";

const dir = mkdtempSync(join(tmpdir(), "pages-preview-"));
mkdirSync(join(dir, "site"));
writeFileSync(
	join(dir, "site", "index.html"),
	"<!doctype html><html><head><title>t</title></head><body></body></html>",
);
writeFileSync(join(dir, "site", "app.css"), "body{}");
writeFileSync(join(dir, "secret.txt"), "outside");
const site = resolvePreviewSite(join(dir, "site"));

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

	test("refuses paths outside the page's directory", () => {
		expect(previewResponse(site, "/../secret.txt").status).toBe(404);
		expect(previewResponse(site, "/%2e%2e/secret.txt").status).toBe(404);
	});
});
