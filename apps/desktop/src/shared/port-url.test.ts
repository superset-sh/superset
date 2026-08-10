import { describe, expect, test } from "bun:test";
import { buildPortUrl } from "./port-url";

describe("buildPortUrl", () => {
	test("defaults to http", () => {
		expect(buildPortUrl({ port: 3000, scheme: null })).toBe(
			"http://localhost:3000",
		);
		expect(buildPortUrl({ port: 3000, scheme: "http" })).toBe(
			"http://localhost:3000",
		);
	});

	test("uses https when the port declares it", () => {
		expect(buildPortUrl({ port: 3030, scheme: "https" })).toBe(
			"https://localhost:3030",
		);
	});

	test("treats a missing scheme like http, for rows from an older host-service", () => {
		expect(buildPortUrl({ port: 8080 })).toBe("http://localhost:8080");
	});
});
