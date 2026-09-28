import { describe, expect, it } from "bun:test";
import { parseGitHubRemote } from "./github-remote";

// Reproduction for #5649:
//
//   "Opening a non-GitHub repo on a second machine silently creates a
//    duplicate project instead of joining the existing one."
//
// The whole silent-duplicate chain starts here. `parseGitHubRemote` is the
// single point that turns a remote URL into the identity the folder-import
// pre-flight uses to find an existing project to adopt. When it returns
// `null`, the pre-flight bails at project.ts with
// `{ candidates: [], cloudErrors: [] }` — zero candidates AND zero errors,
// which is exactly what makes the failure silent. The flow then falls
// through to project.create, which mints a fresh UUID, collides on
// (organizationId, slug), and the retry loop silently allocates `my-app-2`.
//
// These tests pin down that root-cause behavior. The GitHub cases are the
// control (they must keep working); the self-hosted / non-github.com cases
// document the reported bug.
describe("parseGitHubRemote", () => {
	describe("GitHub remotes (control — must resolve to a stable identity)", () => {
		it("parses an https github.com remote", () => {
			expect(parseGitHubRemote("https://github.com/team/my-app")).toEqual({
				provider: "github",
				owner: "team",
				name: "my-app",
				url: "https://github.com/team/my-app",
			});
		});

		it("parses an ssh github.com remote to the same identity", () => {
			expect(parseGitHubRemote("git@github.com:team/my-app.git")).toEqual({
				provider: "github",
				owner: "team",
				name: "my-app",
				url: "https://github.com/team/my-app",
			});
		});

		it("derives the same identity from https and ssh forms", () => {
			// This is why two machines that both use GitHub adopt the same
			// project: the remote resolves to one stable url regardless of
			// clone protocol.
			const https = parseGitHubRemote("https://github.com/team/my-app");
			const ssh = parseGitHubRemote("git@github.com:team/my-app.git");
			expect(https?.url).toBe(ssh?.url);
			expect(https?.url).toBeDefined();
		});
	});

	describe("non-GitHub remotes (bug: no identity → silent duplicate)", () => {
		// The exact scenario from the issue: origin on self-hosted GitLab.
		const gitlabRemotes = [
			"https://gitlab.example.com/team/my-app",
			"https://gitlab.example.com/team/my-app.git",
			"git@gitlab.example.com:team/my-app.git",
			"ssh://git@gitlab.example.com/team/my-app.git",
		];

		for (const remote of gitlabRemotes) {
			it(`does not yield a stable identity for ${remote}`, () => {
				// EXPECTED (per the issue): a repo cloned from the same remote
				// on a second machine should resolve to a stable identity so it
				// can adopt the existing project instead of creating a duplicate.
				//
				// ACTUAL: parseGitHubRemote hard-codes github.com in all three
				// patterns (github-remote.ts:12-15), so every non-github.com
				// host returns null. This assertion documents the bug and will
				// fail once the identity lookup handles non-GitHub remotes.
				const parsed = parseGitHubRemote(remote);
				expect(parsed).not.toBeNull();
			});
		}
	});
});
