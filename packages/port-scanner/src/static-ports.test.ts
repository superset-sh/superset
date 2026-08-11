import { describe, expect, it } from "bun:test";
import { parseStaticPortsConfig } from "./static-ports.ts";

function parseEntry(entry: Record<string, unknown>) {
	return parseStaticPortsConfig(JSON.stringify({ ports: [entry] }));
}

describe("parseStaticPortsConfig scheme", () => {
	it("defaults to http when an entry omits it", () => {
		expect(parseEntry({ port: 3000, label: "Frontend" }).ports).toEqual([
			{ port: 3000, label: "Frontend", scheme: "http" },
		]);
	});

	it("keeps http and https as declared", () => {
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

	it("rejects any other scheme", () => {
		for (const scheme of ["ws", "HTTPS", "", true]) {
			const result = parseEntry({ port: 3000, label: "Web", scheme });
			expect(result.ports).toBeNull();
			expect(result.error).toBe('ports[0].scheme must be "http" or "https"');
		}
	});
});
