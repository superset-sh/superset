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

function stubPath(gitStub: string, glabStub?: string): string {
	const dir = mkdtempSync(join(tmpdir(), "superset-cred-stub-"));
	tempDirs.push(dir);
	for (const [name, body] of [
		["gh", GH_STUB],
		["git", gitStub],
		...(glabStub ? [["glab", glabStub]] : []),
	]) {
		const path = join(dir, name as string);
		writeFileSync(path, body as string);
		chmodSync(path, 0o755);
	}
	return dir;
}

function providerWith(
	env: Record<string, string>,
	gitStub = GIT_STUB,
	glabStub?: string,
) {
	const dir = stubPath(gitStub, glabStub);
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

const GLAB_STUB = `#!/bin/sh
if [ "$1 $2" != "config get" ]; then exit 1; fi
case "$3" in
  host) printf '%s\\n' "\${STORED_HOST:-gitlab.com}" ;;
  token)
    if [ -n "$GITLAB_TOKEN" ]; then printf '%s\\n' "$GITLAB_TOKEN"; exit 0; fi
    if [ -n "$GITLAB_ACCESS_TOKEN" ]; then printf '%s\\n' "$GITLAB_ACCESS_TOKEN"; exit 0; fi
    if [ -n "$OAUTH_TOKEN" ]; then printf '%s\\n' "$OAUTH_TOKEN"; exit 0; fi
    case "$5" in
      first.example) printf 'first-token\\n' ;;
      second.example:8443) printf 'second-token\\n' ;;
      *)
        if [ -n "$GIT_DIR" ] && [ -f "$GIT_DIR/glab-cli/config.yml" ]; then
          IFS= read -r sentinel < "$GIT_DIR/glab-cli/config.yml"
          printf '%s\\n' "\${sentinel#token: }"
        else printf '%s\\n' "$ROOT_TOKEN"; fi ;;

    esac ;;
  *) exit 1 ;;
esac
`;

describe("LocalGitCredentialProvider GitLab host scope", () => {
	test("resolves separate stored tokens without replaying unscoped environment tokens", async () => {
		const provider = providerWith(
			{ GITLAB_TOKEN: "unscoped-token" },
			GIT_STUB,
			GLAB_STUB,
		);
		expect(await provider.getToken("first.example")).toBe("first-token");
		expect(await provider.getToken("second.example:8443")).toBe("second-token");
		expect(await provider.getToken("unknown.example")).toBeNull();
		expect(provider.credentialRemedy("first.example", "rejected")).toContain(
			"glab auth login --hostname first.example",
		);
	});

	test("uses a GitLab environment token only for its normalized host and port", async () => {
		const provider = providerWith(
			{
				GITLAB_TOKEN: "scoped-token",
				GITLAB_HOST: "https://SECOND.example:8443/",
			},
			GIT_STUB,
			GLAB_STUB,
		);
		expect(await provider.getToken("second.example:8443")).toBe("scoped-token");
		expect(await provider.getToken("first.example")).toBe("first-token");
		expect(await provider.getToken("second.example")).toBeNull();
		expect(
			provider.credentialRemedy("second.example:8443", "rejected"),
		).toContain("GITLAB_TOKEN");
	});

	test("uses an unscoped GitLab environment token only on gitlab.com", async () => {
		const provider = providerWith(
			{ GITLAB_ACCESS_TOKEN: "default-token" },
			GIT_STUB,
			GLAB_STUB,
		);
		expect(await provider.getToken("gitlab.com")).toBe("default-token");
		expect(await provider.getToken("first.example")).toBe("first-token");
	});

	test("rejects a root config token even on the configured default host", async () => {
		const provider = providerWith(
			{
				ROOT_TOKEN: "global-token",
				STORED_HOST: "https://DEFAULT.example:8443/",
			},
			GIT_STUB,
			GLAB_STUB,
		);
		expect(await provider.getToken("default.example:8443")).toBeNull();
		expect(await provider.getToken("unknown.example")).toBeNull();
		expect(await provider.getToken("gitlab.com")).toBeNull();
	});

	test("does not use glab on GitHub or replace a configured git credential helper", async () => {
		const provider = providerWith(
			{ GITLAB_TOKEN: "lab-token" },
			GIT_HELPER_REPLAYS_ENV_STUB,
			GLAB_STUB,
		);
		expect(await provider.getToken("first.example")).toBe("stored-credential");
		expect(provider.credentialRemedy("first.example", "rejected")).toContain(
			"saved first.example credential",
		);
	});

	test("non-GitHub missing credentials name the requested host", () => {
		const provider = providerWith({});
		expect(
			provider.credentialRemedy("second.example:8443", "missing"),
		).toContain("second.example:8443");
		expect(
			provider.credentialRemedy("second.example:8443", "missing"),
		).not.toContain("GitHub");
	});

	test.each([
		"USAGE\\n  glab config get <key>\\n",
		"one-token\\ntwo-token\\n",
		"Usage",
		"token with spaces",
		"",
	])("rejects malformed CLI token output: %s", async (output) => {
		const provider = providerWith(
			{},
			GIT_STUB,
			`#!/bin/sh\nif [ "$3" = "token" ]; then printf '${output}'; else printf 'gitlab.com\\n'; fi\n`,
		);
		expect(await provider.getToken("gitlab.com")).toBeNull();
	});

	test("rejects failed native glab lookup", async () => {
		const provider = providerWith({}, GIT_STUB, `#!/bin/sh\nexit 1\n`);
		expect(await provider.getToken("first.example")).toBeNull();
	});
	test("uses GL_HOST and GitLab token variable precedence", async () => {
		const provider = providerWith(
			{
				GL_HOST: "second.example:8443",
				GITLAB_TOKEN: "preferred-token",
				GITLAB_ACCESS_TOKEN: "access-token",
				OAUTH_TOKEN: "oauth-token",
			},
			GIT_STUB,
			GLAB_STUB,
		);
		expect(await provider.getToken("second.example:8443")).toBe(
			"preferred-token",
		);
	});

	test.each([
		"https://user:pass@second.example:8443",
		"second.example:8443 with spaces",
		"file://second.example:8443",
	])("rejects unsafe environment host scope: %s", async (GITLAB_HOST) => {
		const provider = providerWith(
			{ GITLAB_HOST, GITLAB_TOKEN: "env-token" },
			GIT_STUB,
			GLAB_STUB,
		);
		expect(await provider.getToken("second.example:8443")).toBe("second-token");
		expect(await provider.getToken("unknown.example")).toBeNull();
	});
	test.each([
		"GITLAB_TOKEN",
		"GITLAB_ACCESS_TOKEN",
		"OAUTH_TOKEN",
	])("names %s when a configured helper replays that environment token", async (name) => {
		const provider = providerWith(
			{ [name]: "helper-env-token" },
			`#!/bin/sh\ncat > /dev/null\nprintf 'password=%s\\n' "$${name}"\n`,
		);
		expect(await provider.getToken("first.example")).toBe("helper-env-token");
		const remedy = provider.credentialRemedy("first.example", "rejected");
		expect(remedy).toContain(name);
		expect(remedy).not.toContain("saved first.example credential");
	});

	test("does not label another host's helper token as a GitHub variable", async () => {
		const provider = providerWith(
			{
				GH_TOKEN: "helper-token",
				GITHUB_TOKEN: "helper-token",
				CREDENTIAL_TOKEN: "helper-token",
			},
			`#!/bin/sh\ncat > /dev/null\nprintf 'password=%s\\n' "$CREDENTIAL_TOKEN"\n`,
		);
		expect(await provider.getToken("first.example")).toBe("helper-token");
		const remedy = provider.credentialRemedy("first.example", "rejected");
		expect(remedy).toContain("saved first.example credential");
		expect(remedy).not.toContain("GH_TOKEN");
		expect(remedy).not.toContain("GITHUB_TOKEN");
	});
});
