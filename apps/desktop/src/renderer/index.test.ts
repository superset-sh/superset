import { describe, expect, test } from "bun:test";

const indexHtml = await Bun.file(new URL("index.html", import.meta.url)).text();
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
	test.each([
		"https://relay2.superset.sh",
		"https://superset-relay2.avi-6ac.workers.dev",
	])("allows HTTP requests to Relay 2 origin %s", (origin) => {
		expect(cspDirective("connect-src")).toContain(origin);
	});
});
