#!/usr/bin/env bun

// Enforces unified versioning: desktop is the ceiling (a plain MAJOR.MINOR.PATCH
// release), and every UNIFIED_PACKAGES entry must share that base and equal each
// other. Interim CLI releases add a -N suffix (e.g. 1.14.0-1) which sorts BELOW
// the release, so the CLI never ships above desktop. pty-daemon is excluded.

import {
	assertUnified,
	DESKTOP_PACKAGE,
	repoRoot,
	UNIFIED_PACKAGES,
} from "./lib.ts";

/** Returns true if versions are unified, false (after printing errors) if not. */
export async function runCheck(): Promise<boolean> {
	const root = await repoRoot();
	const { desktop, entries, errors } = await assertUnified(root);

	if (errors.length > 0) {
		for (const e of errors) console.error(`  ✗ ${e}`);
		console.error(
			`\nVersion drift detected. Unified rule: ${DESKTOP_PACKAGE} == ${UNIFIED_PACKAGES.join(" == ")}`,
		);
		console.error(`(interim CLI releases may add a -N suffix, e.g. ${desktop}-1).`);
		return false;
	}

	const summary = entries.map((e) => `${e.name}=${e.version}`).join(" ");
	console.log(`✓ versions unified at ${desktop}: ${DESKTOP_PACKAGE} ${summary}`);
	return true;
}

if (import.meta.main) process.exit((await runCheck()) ? 0 : 1);
