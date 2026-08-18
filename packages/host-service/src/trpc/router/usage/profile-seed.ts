/**
 * Marks a secondary Claude profile's onboarding as complete so its first
 * agent launch goes straight to the prompt instead of the first-boot wizard
 * (where a stray Enter can start a login that silently rebinds the profile).
 *
 * This edits the CLI's state file (`.claude.json`), never a credential
 * store, and only ever adds two preference keys — everything else is left
 * exactly as the CLI wrote it.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function seedClaudeProfileOnboarding(configDir: string): void {
	const statePath = join(configDir, ".claude.json");
	let state: Record<string, unknown>;
	try {
		state = JSON.parse(readFileSync(statePath, "utf-8"));
	} catch {
		// No parsable state file means no completed login yet — nothing to seed.
		return;
	}
	if (state.hasCompletedOnboarding === true) return;
	state.hasCompletedOnboarding = true;
	if (state.theme === undefined) {
		// Carry the default profile's theme so the first launch looks familiar.
		try {
			const defaultState = JSON.parse(
				readFileSync(join(homedir(), ".claude.json"), "utf-8"),
			) as { theme?: unknown };
			if (typeof defaultState.theme === "string") {
				state.theme = defaultState.theme;
			}
		} catch {
			// Theme stays unset; the CLI falls back to its own default.
		}
	}
	writeFileSync(statePath, JSON.stringify(state, null, 2));
}
