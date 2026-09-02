import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalGitCredentialProvider } from "./LocalGitCredentialProvider";

/**
 * `gh auth token` echoes the environment ahead of its stored login, GH_TOKEN
 * before GITHUB_TOKEN, matching the real CLI's precedence.
 */
const GH_STUB = `#!/bin/sh
if [ -n "$GH_TOKEN" ]; then printf '%s\\n' "$GH_TOKEN"; exit 0; fi
if [ -n "$GITHUB_TOKEN" ]; then printf '%s\\n' "$GITHUB_TOKEN"; exit 0; fi
printf 'stored-gh-login\\n'
`;

/** A `git` that never resolves a credential, so lookup reaches the gh CLI. */
const GIT_STUB = `#!/bin/sh
exit 1
`;

/**
 * `credential.helper = gh auth git-credential`, which replays the exported
 * token instead of anything stored. Set up by \`gh auth setup-git\`.
 */
const GIT_HELPER_REPLAYS_ENV_STUB = `#!/bin/sh
cat > /dev/null
if [ -n "$GITHUB_TOKEN" ]; then printf 'password=%s\\n' "$GITHUB_TOKEN"; exit 0; fi
printf 'password=stored-credential\\n'
`;

const tempDirs: string[] = [];

function stubPath(gitStub: string): string {
	const dir = mkdtempSync(join(tmpdir(), "superset-cred-stub-"));
	tempDirs.push(dir);
	for (const [name, body] of [
		["gh", GH_STUB],
		["git", gitStub],
	]) {
		const path = join(dir, name as string);
		writeFileSync(path, body as string);
		chmodSync(path, 0o755);
	}
	return dir;
}

function providerWith(env: Record<string, string>, gitStub = GIT_STUB) {
	const dir = stubPath(gitStub);
	return new LocalGitCredentialProvider(async () => ({
		PATH: dir,
		...env,
	}));
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("LocalGitCredentialProvider token sources", () => {
	// The app's own env is checked before anything is spawned; these tests
	// exercise the login-shell path, so it must be clear.
	const withoutProcessTokens = async (run: () => Promise<void>) => {
		const saved = {
			GITHUB_TOKEN: process.env.GITHUB_TOKEN,
			GH_TOKEN: process.env.GH_TOKEN,
		};
		process.env.GITHUB_TOKEN = undefined;
		process.env.GH_TOKEN = undefined;
		delete process.env.GITHUB_TOKEN;
		delete process.env.GH_TOKEN;
		try {
			await run();
		} finally {
			if (saved.GITHUB_TOKEN !== undefined)
				process.env.GITHUB_TOKEN = saved.GITHUB_TOKEN;
			if (saved.GH_TOKEN !== undefined) process.env.GH_TOKEN = saved.GH_TOKEN;
		}
	};

	test("a GITHUB_TOKEN exported by the login shell is not blamed on the gh CLI", async () => {
		await withoutProcessTokens(async () => {
			const provider = providerWith({ GITHUB_TOKEN: "shell-token" });
			expect(await provider.getToken("github.com")).toBe("shell-token");
			// `gh auth login` would not displace the variable, so the remedy
			// has to name the variable instead.
			const remedy = provider.credentialRemedy("github.com", "rejected");
			expect(remedy).toContain("GITHUB_TOKEN");
			expect(remedy).not.toContain("gh auth login");
		});
	});

	test("GH_TOKEN from the login shell is named too", async () => {
		await withoutProcessTokens(async () => {
			const provider = providerWith({ GH_TOKEN: "shell-gh-token" });
			expect(await provider.getToken("github.com")).toBe("shell-gh-token");
			expect(provider.credentialRemedy("github.com", "rejected")).toContain(
				"GH_TOKEN",
			);
		});
	});

	test("GH_TOKEN wins when both variables are set, as it does for gh", async () => {
		await withoutProcessTokens(async () => {
			const provider = providerWith({
				GH_TOKEN: "gh-token-value",
				GITHUB_TOKEN: "github-token-value",
			});
			expect(await provider.getToken("github.com")).toBe("gh-token-value");
			const remedy = provider.credentialRemedy("github.com", "rejected");
			expect(remedy).toContain("GH_TOKEN");
			expect(remedy).not.toContain("GITHUB_TOKEN");
		});
	});

	test("a credential helper replaying the exported token names the variable", async () => {
		await withoutProcessTokens(async () => {
			const provider = providerWith(
				{ GITHUB_TOKEN: "shell-token" },
				GIT_HELPER_REPLAYS_ENV_STUB,
			);
			expect(await provider.getToken("github.com")).toBe("shell-token");
			const remedy = provider.credentialRemedy("github.com", "rejected");
			expect(remedy).toContain("GITHUB_TOKEN");
			expect(remedy).not.toContain("saved github.com credential");
		});
	});

	test("a genuinely stored credential is still reported as saved", async () => {
		await withoutProcessTokens(async () => {
			const provider = providerWith({}, GIT_HELPER_REPLAYS_ENV_STUB);
			expect(await provider.getToken("github.com")).toBe("stored-credential");
			expect(provider.credentialRemedy("github.com", "rejected")).toContain(
				"saved github.com credential",
			);
		});
	});

	test("a real gh login is still reported as the gh CLI", async () => {
		await withoutProcessTokens(async () => {
			const provider = providerWith({});
			expect(await provider.getToken("github.com")).toBe("stored-gh-login");
			expect(provider.credentialRemedy("github.com", "rejected")).toContain(
				"gh auth login",
			);
		});
	});
});
