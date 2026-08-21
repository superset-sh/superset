import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const indexHtml = readFileSync(
	join(import.meta.dir, "renderer", "index.html"),
	"utf8",
);
const contentSecurityPolicy = indexHtml.match(
	/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/,
)?.[1];

function cspDirective(name: string): string[] {
	const directive = contentSecurityPolicy
		?.split(";")
		.map((entry) => entry.trim())
		.find((entry) => entry.startsWith(`${name} `));
	return directive?.split(/\s+/).slice(1) ?? [];
}

describe("renderer content security policy", () => {
	test("allows HTTP requests to the production Relay 2 origin", () => {
		expect(cspDirective("connect-src")).toContain("https://relay2.superset.sh");
	});
});
