import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";

// errorMessage() output is potentially translated, so it is display-only:
// letting it reach logs, telemetry, or string matching would put localized
// text where stable English is required (grep-ability, Sentry grouping,
// classification). This scan enforces that repo-wide; use rawErrorMessage()
// or the error object for those paths.
const REPO_ROOT = resolve(import.meta.dir, "../../..");
const SCAN_DIRS = ["apps/desktop/src", "apps/web/src", "packages/ui/src"];

const FORBIDDEN: { name: string; pattern: RegExp }[] = [
	{
		name: "errorMessage() into console logging",
		pattern:
			/console\.(?:log|warn|error|info|debug)\([^;]{0,200}errorMessage\(/,
	},
	{
		name: "errorMessage() into Sentry",
		pattern:
			/captureException\([^;]{0,200}errorMessage\(|captureMessage\([^;]{0,200}errorMessage\(/,
	},
	{
		name: "errorMessage() into analytics",
		pattern: /(?:posthog|track|capture)\([^;]{0,200}errorMessage\(/,
	},
	{
		name: "string-matching on errorMessage() output",
		pattern:
			/errorMessage\([^)]*\)\s*\.\s*(?:includes|toLowerCase|toUpperCase|match|startsWith|endsWith|indexOf)/,
	},
];

describe("errorMessage() stays display-only", () => {
	for (const dir of SCAN_DIRS) {
		test(`${dir} has no translated strings in logs or logic`, async () => {
			const offenders: string[] = [];
			const glob = new Bun.Glob("**/*.{ts,tsx}");
			for await (const file of glob.scan({ cwd: join(REPO_ROOT, dir) })) {
				if (file.includes(".test.") || file.includes(".stories.")) continue;
				const source = await Bun.file(join(REPO_ROOT, dir, file)).text();
				if (!source.includes("errorMessage(")) continue;
				for (const { name, pattern } of FORBIDDEN) {
					const match = source.match(pattern);
					if (match) {
						const line = source.slice(0, match.index).split("\n").length;
						offenders.push(`${dir}/${file}:${line} ${name}`);
					}
				}
			}
			// Alias tracking: `const x = errorMessage(...)` later string-matched.
			const glob2 = new Bun.Glob("**/*.{ts,tsx}");
			for await (const file of glob2.scan({ cwd: join(REPO_ROOT, dir) })) {
				if (file.includes(".test.") || file.includes(".stories.")) continue;
				const source = await Bun.file(join(REPO_ROOT, dir, file)).text();
				if (!source.includes("errorMessage(")) continue;
				const aliases = [
					...source.matchAll(
						/(?:const|let)\s+(\w+)\s*=\s*\n?\s*errorMessage\(/g,
					),
				].map((m) => m[1]);
				for (const name of aliases) {
					const use = source.match(
						new RegExp(
							`\\b${name}\\s*\\.\\s*(?:includes|toLowerCase|toUpperCase|match|startsWith|endsWith|indexOf)\\(`,
						),
					);
					if (use) {
						const line = source.slice(0, use.index).split("\n").length;
						offenders.push(
							`${dir}/${file}:${line} string-matching on aliased errorMessage() value (${name})`,
						);
					}
				}
			}
			expect(
				offenders,
				`Translated display strings leaked into logs/telemetry/logic. Use rawErrorMessage() or the error object there. Offenders:\n${offenders.join("\n")}`,
			).toEqual([]);
		});
	}
});
