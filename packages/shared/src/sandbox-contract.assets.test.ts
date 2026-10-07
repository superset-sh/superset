import { expect, test } from "bun:test";
import { renderContractShell, sandboxAssetBaseURL } from "./sandbox-contract";

test("upstream-equivalent CDN inputs preserve default contract bytes", () => {
	for (const input of [
		undefined,
		"https://cdn.superset.sh",
		"HTTPS://CDN.SUPERSET.SH:443/",
	]) {
		expect(sandboxAssetBaseURL(input)).toBe("https://cdn.superset.sh/sandbox");
		expect(renderContractShell(input)).toBe(renderContractShell());
	}
});
test("selected canonical mirror prefix is rendered once", () => {
	expect(sandboxAssetBaseURL("HTTPS://Mirror.Example.TEST:8443/assets/")).toBe(
		"https://mirror.example.test:8443/assets/sandbox",
	);
	expect(renderContractShell("https://mirror.example.test/assets")).toContain(
		"SUPERSET_ASSET_BASE_URL='https://mirror.example.test/assets/sandbox'\n",
	);
	expect(sandboxAssetBaseURL("https://mirror.example.test/sandbox")).toBe(
		"https://mirror.example.test/sandbox/sandbox",
	);
});
for (const input of [
	"",
	" https://mirror.example.test",
	"https://mirror.example.test\n",
	"http://mirror.example.test",
	"https://user:OWNED_TOKEN@mirror.example.test",
	"https://@mirror.example.test",
	"https://mirror.example.test?",
	"https://mirror.example.test#",
	"https://mirror.example.test/a/../b",
	"https://mirror.example.test/a/./b",
	"https://mirror.example.test/%2e%2e",
	"https://mirror.example.test/a//b",
	"https://mirror.example.test/a\\b",
	"https://mirror.example.test/a'bc",
	"https://mirror.example.test:",
	"https://mirror.example.test:0",
	"https://mirror.example.test:65536",
	"https://127.0.0.1",
	"https://127.1",
	"https://2130706433",
	"https://0x7f000001",
	"https://mirror.example.test/a\n",
	"https://localhost",
	"https://mirror.example.test.",
	"https://mírroŕ.example.test",
	"https://mirror_example.test",
	"https://mirror.example.test/../",
	"https://mirror.example.test///",
])
	test(`rejects ambiguous CDN base ${JSON.stringify(input)}`, () => {
		expect(() => sandboxAssetBaseURL(input)).toThrow("Invalid sandbox CDN URL");
		expect(() => renderContractShell(input)).toThrow("Invalid sandbox CDN URL");
		try {
			sandboxAssetBaseURL(input);
		} catch (error) {
			expect(String(error)).not.toContain("OWNED_TOKEN");
		}
	});
