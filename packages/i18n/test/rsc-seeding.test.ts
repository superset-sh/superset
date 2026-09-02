import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";

// Lingui's RSC `<Trans>`/`useLingui()` read the i18n instance from a
// React.cache slot that `initServerI18n()` seeds. The slot lives for exactly
// one render pass, and a client-side navigation renders only the segments
// below the shared layout — the root layout and any template are pruned, so
// seeding there covers a full document load and nothing else. Every route
// entry has to seed for itself or its server components throw mid-render.
// Regression guard for MARKETING-67/68/69.
//
// Note this never showed up in CI or locally: a document request renders the
// layout, so only a real client-side navigation against a deployment failed.
// That is why the guard is static rather than a smoke test.
const REPO_ROOT = resolve(import.meta.dir, "../../..");
const ROUTE_ENTRY = /(?:^|\/)(?:page|not-found)\.tsx$/;
// Anchored to the start of a line so a mention inside a comment or a string
// literal cannot satisfy the check; paired with the import so the call has to
// resolve to the real helper.
// The call must be awaited: a bare initServerI18n() activates the default
// locale and served every visitor English heroes above localized bodies —
// request-locale resolution is async, so an un-awaited call cannot have
// worked. (Regression guard for the 2026-08-29 production finding.)
const SEEDS = /^\s*(?:const\s+\w+\s*=\s*)?await initServerI18n\(\);/m;
const IMPORTS = /^import\s*\{[^}]*\binitServerI18n\b[^}]*\}\s*from\s*["']/m;
const USES_I18N = /<Trans\b|useLingui\(/;
const CLIENT_COMPONENT = /^\s*["']use client["']/m;

// Every Next.js app in the repo. Apps with no server-rendered translation are
// still listed: the check arms itself the moment one is added, which is the
// point — marketing had no guard until it had already broken in production.
const NEXT_APPS = ["marketing", "web", "admin", "docs"] as const;

async function scan(app: string) {
	const srcDir = join(REPO_ROOT, "apps", app, "src");
	const entries: { file: string; source: string }[] = [];
	let hasServerI18n = false;

	const glob = new Bun.Glob("**/*.{ts,tsx}");
	for await (const file of glob.scan({ cwd: srcDir })) {
		const source = await Bun.file(join(srcDir, file)).text();
		const isClient = CLIENT_COMPONENT.test(source);
		if (!isClient && USES_I18N.test(source)) hasServerI18n = true;
		if (file.startsWith("app/") && ROUTE_ENTRY.test(file) && !isClient) {
			entries.push({ file, source });
		}
	}
	return { entries, hasServerI18n };
}

describe("RSC route entries seed i18n", () => {
	for (const app of NEXT_APPS) {
		test(`${app}: every server route entry calls initServerI18n()`, async () => {
			const { entries, hasServerI18n } = await scan(app);

			// An app whose translated markup is entirely in client components
			// gets its i18n instance from the I18nProvider through context, so
			// there is nothing to seed and nothing to enforce yet.
			if (!hasServerI18n) {
				expect(entries.length).toBeGreaterThanOrEqual(0);
				return;
			}

			const offenders = entries
				.filter(({ source }) => !SEEDS.test(source) || !IMPORTS.test(source))
				.map(({ file }) => `${app}/${file}`);
			expect(offenders).toEqual([]);
		});
	}
});
