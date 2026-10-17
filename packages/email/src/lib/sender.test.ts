import { describe, expect, test } from "bun:test";

function loadNoreplyFrom(overrides: Record<string, string> = {}): string {
	const env: Record<string, string | undefined> = {
		...process.env,
		NEXT_PUBLIC_MARKETING_URL: "http://localhost:3002",
	};
	delete env.EMAIL_SENDING_DOMAIN;
	delete env.NEXT_PUBLIC_ROOT_DOMAIN;
	const script = `
		const { NOREPLY_FROM } = await import("./sender.ts");
		console.log(NOREPLY_FROM);
	`;
	const result = Bun.spawnSync(["bun", "-e", script], {
		cwd: import.meta.dir,
		env: { ...env, ...overrides },
	});
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString().trim();
}

describe("NOREPLY_FROM", () => {
	test("equals the production sender when no env var is set", () => {
		expect(loadNoreplyFrom()).toBe("Superset <noreply@superset.sh>");
		expect(loadNoreplyFrom({ EMAIL_SENDING_DOMAIN: "" })).toBe(
			"Superset <noreply@superset.sh>",
		);
	});

	test("follows EMAIL_SENDING_DOMAIN, not the root domain", () => {
		expect(
			loadNoreplyFrom({
				EMAIL_SENDING_DOMAIN: "mail.example.org",
				NEXT_PUBLIC_ROOT_DOMAIN: "example.com",
			}),
		).toBe("Superset <noreply@mail.example.org>");
	});
});
