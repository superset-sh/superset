import { describe, expect, test } from "bun:test";
import { parseStaticPortsConfig } from "./static-ports.ts";

describe("parseStaticPortsConfig scheme", () => {
	test("defaults to http when an entry omits it", () => {
		const result = parseStaticPortsConfig(
			JSON.stringify({ ports: [{ port: 3000, label: "Frontend" }] }),
		);

		expect(result.ports).toEqual([
			{ port: 3000, label: "Frontend", scheme: "http" },
		]);
	});

	test("keeps http and https as declared", () => {
		const result = parseStaticPortsConfig(
			JSON.stringify({
				ports: [
					{ port: 3000, label: "Web", scheme: "https" },
					{ port: 8080, label: "API", scheme: "http" },
				],
			}),
		);

		expect(result.ports).toEqual([
			{ port: 3000, label: "Web", scheme: "https" },
			{ port: 8080, label: "API", scheme: "http" },
		]);
	});

	test("rejects any other scheme", () => {
		const result = parseStaticPortsConfig(
			JSON.stringify({ ports: [{ port: 3000, label: "Web", scheme: "ws" }] }),
		);

		expect(result.ports).toBeNull();
		expect(result.error).toBe('ports[0].scheme must be "http" or "https"');
	});

	test("rejects a non-string scheme", () => {
		const result = parseStaticPortsConfig(
			JSON.stringify({ ports: [{ port: 3000, label: "Web", scheme: true }] }),
		);

		expect(result.ports).toBeNull();
		expect(result.error).toBe('ports[0].scheme must be "http" or "https"');
	});
});
