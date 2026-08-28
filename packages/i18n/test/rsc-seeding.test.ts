import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";

// Lingui's RSC `<Trans>`/`useLingui()` read the i18n instance from a
// React.cache slot that `initServerI18n()` seeds. The slot lives for exactly
// one render pass, and a client-side navigation renders only the segments
// below the shared layout — the root layout and any template are pruned, so
// seeding there covers a full document load and nothing else. Every route
// entry has to seed for itself or its server components throw mid-render.
// Regression guard for MARKETING-67/68/69.
const REPO_ROOT = resolve(import.meta.dir, "../../..");
const ROUTE_ENTRY = /(?:^|\/)(?:page|not-found)\.tsx$/;
// Anchored to the start of a line so a mention inside a comment or a string
// literal cannot satisfy the check; paired with the import so the call has to
// resolve to the real helper.
const SEEDS = /^\s*initServerI18n\(\);/m;
const IMPORTS = /^import\s*\{[^}]*\binitServerI18n\b[^}]*\}\s*from\s*["']/m;

describe("RSC route entries seed i18n", () => {
	test("every marketing server route entry calls initServerI18n()", async () => {
		const appDir = join(REPO_ROOT, "apps/marketing/src/app");
		const offenders: string[] = [];
		const glob = new Bun.Glob("**/*.tsx");
		for await (const file of glob.scan({ cwd: appDir })) {
			if (!ROUTE_ENTRY.test(file)) continue;
			const source = await Bun.file(join(appDir, file)).text();
			// Client components render on the client, where the I18nProvider
			// supplies the instance through context instead.
			if (/^\s*["']use client["']/m.test(source)) continue;
			if (!SEEDS.test(source) || !IMPORTS.test(source)) {
				offenders.push(file);
			}
		}
		expect(offenders).toEqual([]);
	});
});
