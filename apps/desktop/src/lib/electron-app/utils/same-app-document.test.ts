import { describe, expect, test } from "bun:test";
import { isSameAppDocument } from "./same-app-document";

const PROD =
	"file:///Applications/Superset.app/Contents/Resources/app/renderer/index.html#/workspace/1";
const DEV = "http://localhost:5173/#/workspace/1";

describe("isSameAppDocument", () => {
	test("allows reloading and re-routing the app's own document", () => {
		expect(isSameAppDocument(PROD, PROD)).toBe(true);
		expect(
			isSameAppDocument(
				PROD,
				"file:///Applications/Superset.app/Contents/Resources/app/renderer/index.html#/settings",
			),
		).toBe(true);
		expect(isSameAppDocument(DEV, "http://localhost:5173/")).toBe(true);
		expect(isSameAppDocument(DEV, "http://localhost:5173/?x=1#/y")).toBe(true);
	});

	test("refuses another local file, which would load with the preload bridge", () => {
		expect(isSameAppDocument(PROD, "file:///tmp/evil.html")).toBe(false);
		expect(
			isSameAppDocument(
				PROD,
				"file:///Applications/Superset.app/Contents/Resources/app/renderer/other.html",
			),
		).toBe(false);
		expect(isSameAppDocument(DEV, "file:///tmp/evil.html")).toBe(false);
	});

	test("refuses other schemes and origins", () => {
		expect(isSameAppDocument(PROD, "javascript:alert(1)")).toBe(false);
		expect(isSameAppDocument(PROD, "superset://auth/callback")).toBe(false);
		expect(isSameAppDocument(DEV, "http://localhost:5174/")).toBe(false);
		expect(isSameAppDocument(DEV, "https://localhost:5173/")).toBe(false);
		expect(isSameAppDocument(DEV, "http://evil.test/")).toBe(false);
	});

	test("refuses when either URL is unparseable", () => {
		expect(isSameAppDocument("", "file:///tmp/evil.html")).toBe(false);
		expect(isSameAppDocument(PROD, "not a url")).toBe(false);
	});
});
