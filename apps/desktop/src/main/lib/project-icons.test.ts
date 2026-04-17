import { describe, expect, test } from "bun:test";
import { parseProjectIconDataUrl } from "./project-icons";

const ICON_BASE64 = Buffer.from("icon").toString("base64");

describe("parseProjectIconDataUrl", () => {
	test("parses PNG data URLs", () => {
		const result = parseProjectIconDataUrl(
			`data:image/png;base64,${ICON_BASE64}`,
		);

		expect(result.ext).toBe("png");
		expect(result.buffer.toString()).toBe("icon");
	});

	test("normalizes JPEG MIME types to the jpg extension", () => {
		const result = parseProjectIconDataUrl(
			`data:image/jpeg;base64,${ICON_BASE64}`,
		);

		expect(result.ext).toBe("jpg");
		expect(result.buffer.toString()).toBe("icon");
	});

	test("parses SVG data URLs with extra MIME parameters", () => {
		const result = parseProjectIconDataUrl(
			`data:image/svg+xml;charset=utf-8;base64,${ICON_BASE64}`,
		);

		expect(result.ext).toBe("svg");
		expect(result.buffer.toString()).toBe("icon");
	});

	test("maps ICO MIME types to the ico extension", () => {
		const xIcon = parseProjectIconDataUrl(
			`data:image/x-icon;base64,${ICON_BASE64}`,
		);
		const microsoftIcon = parseProjectIconDataUrl(
			`data:image/vnd.microsoft.icon;base64,${ICON_BASE64}`,
		);

		expect(xIcon.ext).toBe("ico");
		expect(microsoftIcon.ext).toBe("ico");
	});

	test("rejects unsupported image MIME types", () => {
		expect(() =>
			parseProjectIconDataUrl(`data:image/webp;base64,${ICON_BASE64}`),
		).toThrow("Unsupported icon format");
	});

	test("rejects malformed data URLs", () => {
		expect(() => parseProjectIconDataUrl("not-a-data-url")).toThrow(
			"Invalid data URL format",
		);
	});
});
