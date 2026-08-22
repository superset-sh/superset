import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { readdirSync, readFileSync, statSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { join } from "node:path";

/**
 * The session's `activeOrganizationId` is shared by every window. Reading it to
 * decide what a window shows — or what an action writes to — is the bug behind
 * "second window lists nothing" and "work filed under the wrong organization":
 * the value belongs to whichever window last switched.
 *
 * `useActiveOrganizationId()` is the per-window answer and the default. This
 * test pins the exceptions so a new session reader has to be argued for in
 * review rather than added by habit.
 *
 * To add an entry: say why the read is genuinely account-wide, not
 * window-scoped. "It works today" is not a reason — it works today because
 * most people run one window.
 */
const ACCOUNT_WIDE_READERS: Record<string, string> = {
	// Identity for analytics is the person, not the window they are looking at.
	"components/PostHogUserIdentifier/PostHogUserIdentifier.tsx":
		"analytics identity is per user, not per window",

	// The v1 → v2 migration is a per-machine, per-account event. It runs once
	// for the signed-in user and has no window-scoped meaning.
	"routes/_authenticated/components/V1AutoMigration/V1AutoMigration.tsx":
		"v1 migration is per account, not per window",
	"routes/_authenticated/components/V1AutoMigration/V1MigrationContinuity.tsx":
		"v1 migration is per account, not per window",
	"routes/_authenticated/components/V1FlipNotice/V1FlipNotice.tsx":
		"v1 flip notice is per account, not per window",
	"routes/_authenticated/components/V1FlipNotice/V2FlipWelcome.tsx":
		"v1 flip welcome is per account, not per window",
	"routes/_authenticated/components/V1ImportModal/V1ImportModal.tsx":
		"v1 import is per account, not per window",
	"hooks/useIsV2CloudEnabled.ts":
		"reads the migration-complete flag, which is per account",

	// The gate that decides whether the user has any organization at all, and
	// the screen that creates the first one. Both run before — or outside — the
	// per-window context, so the session is the only source available.
	"routes/_authenticated/layout.tsx":
		"gates on having any org at all, before the per-window context exists",
	"routes/create-organization/page.tsx":
		"runs outside the authenticated layout, where no window org exists yet",

	// The provider that establishes the per-window org. It reads the session
	// exactly once, as the seed for a window that has no org yet.
	"routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx":
		"seeds the per-window org; this is the one sanctioned read",

	// Reads the session's organization for membership and role, which is
	// account-level data rather than a scoping decision.
	"routes/_authenticated/settings/organization/components/OrganizationSettings/OrganizationSettings.tsx":
		"reads account membership, not a window scope",
	"routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider.tsx":
		"session still owns membership and the auth token; the active org here is per-window",
};

const RENDERER_ROOT = join(import.meta.dir, "..", "..");
const SESSION_ORG_PATTERN =
	/session\?\.session\?\.activeOrganizationId|useActiveOrganization\(\)/;

function* walk(dir: string): Generator<string> {
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules" || entry.startsWith(".")) continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			yield* walk(full);
			continue;
		}
		if (entry.endsWith(".ts") || entry.endsWith(".tsx")) yield full;
	}
}

describe("per-window organization", () => {
	test("no unallowlisted reader of the session's active organization", () => {
		const offenders: string[] = [];
		for (const file of walk(RENDERER_ROOT)) {
			if (file.endsWith("sessionOrgReaders.test.ts")) continue;
			if (!SESSION_ORG_PATTERN.test(readFileSync(file, "utf-8"))) continue;
			const relative = file.slice(RENDERER_ROOT.length + 1);
			if (relative in ACCOUNT_WIDE_READERS) continue;
			offenders.push(relative);
		}
		expect(offenders).toEqual([]);
	});

	test("the allowlist has no stale entries", () => {
		const stale = Object.keys(ACCOUNT_WIDE_READERS).filter((relative) => {
			try {
				return !SESSION_ORG_PATTERN.test(
					readFileSync(join(RENDERER_ROOT, relative), "utf-8"),
				);
			} catch {
				return true; // file is gone
			}
		});
		expect(stale).toEqual([]);
	});
});
