import { describe, expect, test } from "bun:test";
import { interpolateStaticUrls, interpolateUrl } from "./interpolate";

describe("interpolateUrl", () => {
	test("replaces ${WORKSPACE} with workspace name", () => {
		const result = interpolateUrl(
			"http://admin.oms.${WORKSPACE}.localhost:1355",
			{ WORKSPACE: "disco-wool" },
		);
		expect(result).toBe("http://admin.oms.disco-wool.localhost:1355");
	});

	test("replaces ${PORT} with port number", () => {
		const result = interpolateUrl("http://localhost:${PORT}", {
			PORT: "4328",
		});
		expect(result).toBe("http://localhost:4328");
	});

	test("replaces multiple variables in a single URL", () => {
		const result = interpolateUrl(
			"http://api.${WORKSPACE}.localhost:${PORT}/docs",
			{ WORKSPACE: "disco-wool", PORT: "1355" },
		);
		expect(result).toBe("http://api.disco-wool.localhost:1355/docs");
	});

	test("replaces multiple occurrences of the same variable", () => {
		const result = interpolateUrl(
			"http://${WORKSPACE}.localhost/${WORKSPACE}",
			{ WORKSPACE: "test" },
		);
		expect(result).toBe("http://test.localhost/test");
	});

	test("leaves unresolvable variables as-is", () => {
		const result = interpolateUrl("http://${UNKNOWN}.localhost:1355", {
			WORKSPACE: "disco-wool",
		});
		expect(result).toBe("http://${UNKNOWN}.localhost:1355");
	});

	test("leaves ${WORKSPACE} when WORKSPACE is not provided", () => {
		const result = interpolateUrl("http://${WORKSPACE}.localhost:1355", {});
		expect(result).toBe("http://${WORKSPACE}.localhost:1355");
	});

	test("leaves ${PORT} when PORT is not provided", () => {
		const result = interpolateUrl("http://localhost:${PORT}", {});
		expect(result).toBe("http://localhost:${PORT}");
	});

	test("returns URL unchanged when it has no variables", () => {
		const result = interpolateUrl("http://localhost:3000/docs", {
			WORKSPACE: "disco-wool",
		});
		expect(result).toBe("http://localhost:3000/docs");
	});

	test("returns empty string unchanged", () => {
		const result = interpolateUrl("", { WORKSPACE: "test" });
		expect(result).toBe("");
	});

	test("handles URL with no variables and no context", () => {
		const result = interpolateUrl("http://example.com", {});
		expect(result).toBe("http://example.com");
	});
});

describe("interpolateStaticUrls", () => {
	test("interpolates all URLs in the array", () => {
		const urls = [
			{
				url: "http://admin.oms.${WORKSPACE}.localhost:1355",
				label: "Admin",
			},
			{
				url: "http://api.oms.${WORKSPACE}.localhost:1355",
				label: "API",
			},
		];

		const result = interpolateStaticUrls(urls, {
			WORKSPACE: "disco-wool",
		});
		expect(result).toEqual([
			{
				url: "http://admin.oms.disco-wool.localhost:1355",
				label: "Admin",
			},
			{
				url: "http://api.oms.disco-wool.localhost:1355",
				label: "API",
			},
		]);
	});

	test("preserves labels without modification", () => {
		const urls = [
			{
				url: "http://${WORKSPACE}.localhost:1355",
				label: "My Service",
			},
		];

		const result = interpolateStaticUrls(urls, {
			WORKSPACE: "disco-wool",
		});
		expect(result[0].label).toBe("My Service");
	});

	test("handles empty array", () => {
		const result = interpolateStaticUrls([], {
			WORKSPACE: "disco-wool",
		});
		expect(result).toEqual([]);
	});

	test("handles mixed resolvable and unresolvable variables", () => {
		const urls = [
			{
				url: "http://${WORKSPACE}.localhost:${PORT}",
				label: "Partial",
			},
		];

		const result = interpolateStaticUrls(urls, {
			WORKSPACE: "disco-wool",
		});
		expect(result).toEqual([
			{
				url: "http://disco-wool.localhost:${PORT}",
				label: "Partial",
			},
		]);
	});

	test("does not modify the original array", () => {
		const urls = [
			{
				url: "http://${WORKSPACE}.localhost:1355",
				label: "Admin",
			},
		];

		interpolateStaticUrls(urls, { WORKSPACE: "disco-wool" });
		expect(urls[0].url).toBe("http://${WORKSPACE}.localhost:1355");
	});
});
