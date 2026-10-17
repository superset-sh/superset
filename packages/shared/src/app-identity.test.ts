import { describe, expect, test } from "bun:test";

const ROOT_DOMAIN_VARS = [
	"NEXT_PUBLIC_ROOT_DOMAIN",
	"EXPO_PUBLIC_ROOT_DOMAIN",
	"NEXT_PUBLIC_MARKETING_URL",
	"NEXT_PUBLIC_DOCS_URL",
];

function loadConstants(overrides: Record<string, string> = {}) {
	const env: Record<string, string | undefined> = { ...process.env };
	for (const key of ROOT_DOMAIN_VARS) delete env[key];
	const script = `
		const { CANONICAL_URLS, COMPANY } = await import("./constants.ts");
		console.log(JSON.stringify({ CANONICAL_URLS, COMPANY }));
	`;
	const result = Bun.spawnSync(["bun", "-e", script], {
		cwd: import.meta.dir,
		env: { ...env, ...overrides },
	});
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return JSON.parse(result.stdout.toString());
}

describe("root-domain constants", () => {
	test("equal the production literals when no env var is set", () => {
		const { CANONICAL_URLS, COMPANY } = loadConstants();
		expect(CANONICAL_URLS).toEqual({
			MARKETING: "https://superset.sh",
			API: "https://api.superset.sh",
			APP: "https://app.superset.sh",
			DOCS: "https://docs.superset.sh",
		});
		expect(COMPANY).toMatchObject({
			NAME: "Superset",
			DOMAIN: "superset.sh",
			EMAIL_DOMAIN: "@superset.sh",
			MARKETING_URL: "https://superset.sh",
			DOCS_URL: "https://docs.superset.sh",
			TERMS_URL: "https://superset.sh/terms",
			PRIVACY_URL: "https://superset.sh/privacy",
			SUPPORT_EMAIL: "support@superset.sh",
			MAIL_TO: "mailto:support@superset.sh",
			TEAM_EMAIL: "team@superset.sh",
			STATUS_URL: "https://status.superset.sh",
			TRUST_URL: "https://trust.superset.sh",
		});
	});

	test("an empty env var keeps the default", () => {
		const { CANONICAL_URLS } = loadConstants({
			NEXT_PUBLIC_ROOT_DOMAIN: "",
			EXPO_PUBLIC_ROOT_DOMAIN: "",
		});
		expect(CANONICAL_URLS.API).toBe("https://api.superset.sh");
	});

	test("follow NEXT_PUBLIC_ROOT_DOMAIN, or EXPO_PUBLIC_ROOT_DOMAIN on mobile", () => {
		for (const key of ["NEXT_PUBLIC_ROOT_DOMAIN", "EXPO_PUBLIC_ROOT_DOMAIN"]) {
			const { CANONICAL_URLS, COMPANY } = loadConstants({
				[key]: "example.org",
			});
			expect(CANONICAL_URLS.API).toBe("https://api.superset.sh");
			expect(CANONICAL_URLS.APP).toBe("https://app.example.org");
			expect(CANONICAL_URLS.MARKETING).toBe("https://example.org");
			expect(COMPANY.MAIL_TO).toBe("mailto:support@example.org");
		}
	});

	test("canonical URLs ignore per-deployment URL overrides", () => {
		const { CANONICAL_URLS, COMPANY } = loadConstants({
			NEXT_PUBLIC_MARKETING_URL: "http://localhost:3002",
			NEXT_PUBLIC_DOCS_URL: "http://localhost:3004",
		});
		expect(COMPANY.MARKETING_URL).toBe("http://localhost:3002");
		expect(CANONICAL_URLS.MARKETING).toBe("https://superset.sh");
		expect(CANONICAL_URLS.DOCS).toBe("https://docs.superset.sh");
	});
});
