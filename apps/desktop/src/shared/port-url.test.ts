import { describe, expect, it } from "bun:test";
import { buildPortUrl } from "./port-url";

describe("buildPortUrl", () => {
	it("defaults to http when no scheme is declared", () => {
		expect(buildPortUrl({ port: 3000, scheme: null })).toBe(
			"http://localhost:3000",
		);
		expect(buildPortUrl({ port: 3000, scheme: "http" })).toBe(
			"http://localhost:3000",
		);
		// Absent entirely — a row from a host-service older than the field.
		expect(buildPortUrl({ port: 8080 })).toBe("http://localhost:8080");
	});

	it("uses https when the port declares it", () => {
		expect(buildPortUrl({ port: 3030, scheme: "https" })).toBe(
			"https://localhost:3030",
		);
	});
});
