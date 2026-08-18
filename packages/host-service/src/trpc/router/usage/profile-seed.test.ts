import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedClaudeProfileOnboarding } from "./profile-seed";

function makeProfile(state: unknown): string {
	const dir = mkdtempSync(join(tmpdir(), "claude-profile-seed-"));
	if (state !== undefined) {
		writeFileSync(join(dir, ".claude.json"), JSON.stringify(state));
	}
	return dir;
}

function readState(dir: string): Record<string, unknown> {
	return JSON.parse(readFileSync(join(dir, ".claude.json"), "utf-8"));
}

describe("seedClaudeProfileOnboarding", () => {
	it("marks onboarding complete and preserves the CLI's other state", () => {
		const dir = makeProfile({
			oauthAccount: { emailAddress: "a@b.c" },
			numStartups: 3,
		});
		seedClaudeProfileOnboarding(dir);
		const state = readState(dir);
		expect(state.hasCompletedOnboarding).toBe(true);
		expect(state.oauthAccount).toEqual({ emailAddress: "a@b.c" });
		expect(state.numStartups).toBe(3);
	});

	it("never overwrites a theme the profile already chose", () => {
		const dir = makeProfile({ theme: "light" });
		seedClaudeProfileOnboarding(dir);
		expect(readState(dir).theme).toBe("light");
	});

	it("does nothing when onboarding is already complete", () => {
		const dir = makeProfile({ hasCompletedOnboarding: true, theme: "light" });
		const before = readFileSync(join(dir, ".claude.json"), "utf-8");
		seedClaudeProfileOnboarding(dir);
		expect(readFileSync(join(dir, ".claude.json"), "utf-8")).toBe(before);
	});

	it("does not create a state file where none exists (no login yet)", () => {
		const dir = makeProfile(undefined);
		seedClaudeProfileOnboarding(dir);
		expect(() => readState(dir)).toThrow();
	});
});
