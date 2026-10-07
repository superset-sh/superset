import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LocalGitCredentialProvider } from "./LocalGitCredentialProvider";

const glab = Bun.which("glab");
const git = Bun.which("git");
const tempDirs: string[] = [];

function fixture(config: string, localConfig?: string, replacement?: string) {
	const dir = mkdtempSync(join(tmpdir(), "superset-glab-native-"));
	tempDirs.push(dir);
	const repo = join(dir, "repo");
	const bin = join(dir, "bin");
	mkdirSync(repo);
	mkdirSync(bin);
	writeFileSync(join(dir, "config.yml"), config, { mode: 0o600 });
	writeFileSync(join(dir, "gitconfig"), "", { mode: 0o600 });
	execFileSync(git as string, ["init", "--quiet", repo]);
	if (localConfig) {
		mkdirSync(join(repo, ".git", "glab-cli"));
		writeFileSync(join(repo, ".git", "glab-cli", "config.yml"), localConfig, {
			mode: 0o600,
		});
	}
	const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
	const invocations = join(dir, "glab-invocations");
	const childGitDir = join(dir, "child-git-dir");
	if (replacement !== undefined)
		writeFileSync(join(dir, "replacement.yml"), replacement, { mode: 0o600 });
	const mutation =
		replacement === undefined
			? ""
			: `
if [ "$1 $2 $3 $4" = "config get token --host" ] && [ ! -f ${quote(join(dir, "mutated"))} ]; then
 ${quote(glab as string)} "$@" > ${quote(join(dir, "captured"))}
 result=$?
 cp ${quote(join(dir, "replacement.yml"))} ${quote(join(dir, "config.yml"))}
 touch ${quote(join(dir, "mutated"))}
 cat ${quote(join(dir, "captured"))}
 exit "$result"
fi
`;
	writeFileSync(
		join(bin, "glab"),
		`#!/bin/sh\ncd ${quote(repo)} || exit 1\nprintf '%s\\n' "$*" >> ${quote(invocations)}\nprintf '%s' "$GIT_DIR" > ${quote(childGitDir)}\n${mutation}exec ${quote(glab as string)} "$@"\n`,
		{ mode: 0o755 },
	);
	const env = {
		PATH: `${bin}:${dirname(git as string)}:/usr/bin:/bin`,
		GLAB_CONFIG_DIR: dir,
		GLAB_SHOW_WHATS_NEW: "false",
		GLAB_SEND_TELEMETRY: "false",
		CHECK_UPDATE: "false",
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: join(dir, "gitconfig"),
		GIT_CONFIG_COUNT: "1",
		GIT_CONFIG_KEY_0: "credential.helper",
		GIT_CONFIG_VALUE_0: "",
	};
	return {
		env,
		dir,
		invocations,
		childGitDir,
		provider: (extra: Record<string, string> = {}) =>
			new LocalGitCredentialProvider(async () => ({ ...env, ...extra })),
	};
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("LocalGitCredentialProvider installed glab", () => {
	test.skipIf(!glab || !git)(
		"separates two hosts and a custom port from the CLI's global and environment fallbacks",
		async () => {
			const { env, provider } = fixture(`host: gitlab.com
token: ROOT_FAKE_TOKEN
hosts:
  first.superset-test.invalid:
    token: FIRST_FAKE_TOKEN
  second.superset-test.invalid:8443:
    token: SECOND_FAKE_TOKEN
`);
			expect(
				execFileSync(
					"glab",
					["config", "get", "token", "--host", "unknown.superset-test.invalid"],
					{ env, encoding: "utf8" },
				).trim(),
			).toBe("ROOT_FAKE_TOKEN");
			const credentials = provider({ GITLAB_TOKEN: "ENV_FAKE_TOKEN" });
			expect(await credentials.getToken("first.superset-test.invalid")).toBe(
				"FIRST_FAKE_TOKEN",
			);
			expect(
				await credentials.getToken("second.superset-test.invalid:8443"),
			).toBe("SECOND_FAKE_TOKEN");
			expect(
				await credentials.getToken("unknown.superset-test.invalid"),
			).toBeNull();
			expect(
				await credentials.getToken("second.superset-test.invalid"),
			).toBeNull();
			expect(await credentials.getToken("gitlab.com")).toBe("ENV_FAKE_TOKEN");
			expect(await provider().getToken("gitlab.com")).toBeNull();
		},
		30_000,
	);

	test.skipIf(!glab || !git)(
		"rejects the CLI's unscoped repository-local fallback even on its configured host",
		async () => {
			const { provider } = fixture(
				"host: gitlab.com\ntoken: ROOT_FAKE_TOKEN\n",
				"host: local.superset-test.invalid:8443\ntoken: LOCAL_FAKE_TOKEN\n",
			);
			expect(
				await provider().getToken("local.superset-test.invalid:8443"),
			).toBeNull();
			expect(await provider().getToken("gitlab.com")).toBeNull();
			expect(
				await provider().getToken("unknown.superset-test.invalid"),
			).toBeNull();
		},
		30_000,
	);

	test.skipIf(!glab || !git)(
		"scopes a URI environment token and leaves other host logins available",
		async () => {
			const { provider } = fixture(`host: default.superset-test.invalid:8443
token: ROOT_FAKE_TOKEN
hosts:
  first.superset-test.invalid:
    token: FIRST_FAKE_TOKEN
`);
			const credentials = provider({
				OAUTH_TOKEN: "ENV_FAKE_TOKEN",
				GITLAB_URI: "https://DEFAULT.superset-test.invalid:8443/gitlab/",
			});
			expect(
				await credentials.getToken("default.superset-test.invalid:8443"),
			).toBe("ENV_FAKE_TOKEN");
			expect(await credentials.getToken("first.superset-test.invalid")).toBe(
				"FIRST_FAKE_TOKEN",
			);
			expect(await credentials.getToken("gitlab.com")).toBeNull();
		},
		30_000,
	);
	test.skipIf(!glab || !git)(
		"does not substitute a global token when the host requires a missing keyring entry",
		async () => {
			const host = `superset-keyring-${randomUUID()}.invalid`;
			const { provider } = fixture(`host: gitlab.com
token: ROOT_FAKE_TOKEN
hosts:
  ${host}:
    use_keyring: true
`);
			expect(await provider().getToken(host)).toBeNull();
		},
		30_000,
	);
	test.skipIf(!glab || !git).each([
		["GITLAB_HOST", "rebound.superset-test.invalid:8443"],
		["GITLAB_URI", "https://REBOUND.superset-test.invalid:8443/gitlab/"],
		["GL_HOST", "rebound.superset-test.invalid:8443"],
	])(
		"does not rebind a global token through %s",
		async (name, value) => {
			const { provider } = fixture(
				"host: gitlab.com\ntoken: ROOT_FAKE_TOKEN\n",
			);
			expect(
				await provider({ [name]: value }).getToken(
					"rebound.superset-test.invalid:8443",
				),
			).toBeNull();
		},
		30_000,
	);

	test.skipIf(!glab || !git)(
		"does not rebind a global token through a repository-local host-only setting",
		async () => {
			const { provider } = fixture(
				"host: gitlab.com\ntoken: ROOT_FAKE_TOKEN\n",
				"host: rebound.superset-test.invalid:8443\n",
			);
			expect(
				await provider().getToken("rebound.superset-test.invalid:8443"),
			).toBeNull();
		},
		30_000,
	);

	test.skipIf(!glab || !git)(
		"accepts a per-host login for the default GitLab host",
		async () => {
			const { provider } = fixture(`host: gitlab.com
token: ROOT_FAKE_TOKEN
hosts:
  gitlab.com:
    token: DEFAULT_HOST_FAKE_TOKEN
`);
			expect(await provider().getToken("gitlab.com")).toBe(
				"DEFAULT_HOST_FAKE_TOKEN",
			);
		},
		30_000,
	);
	test.skipIf(!glab || !git)(
		"rejects a fallback token changed between host and baseline reads",
		async () => {
			const owned = fixture(
				"host: gitlab.com\ntoken: BEFORE_OWNED_FAKE\n",
				undefined,
				"host: gitlab.com\ntoken: AFTER_OWNED_FAKE\n",
			);
			expect(
				await owned.provider().getToken("unknown.superset-test.invalid"),
			).toBeNull();
			expect(
				readFileSync(owned.invocations, "utf8").trim().split("\n"),
			).toHaveLength(1);
			const childDir = readFileSync(owned.childGitDir, "utf8");
			expect(childDir).not.toBe("");
			expect(existsSync(childDir)).toBe(false);
		},
	);
	test.skipIf(!glab || !git)(
		"keeps a stored host token from one snapshot while config changes",
		async () => {
			const owned = fixture(
				"token: ROOT_OWNED_FAKE\nhosts:\n  first.superset-test.invalid:\n    token: BEFORE_OWNED_FAKE\n",
				undefined,
				"token: BEFORE_OWNED_FAKE\nhosts:\n  first.superset-test.invalid:\n    token: AFTER_OWNED_FAKE\n",
			);
			expect(
				await owned.provider().getToken("first.superset-test.invalid"),
			).toBe("BEFORE_OWNED_FAKE");
			expect(
				readFileSync(owned.invocations, "utf8").trim().split("\n"),
			).toHaveLength(1);
		},
	);
	test.skipIf(!glab || !git)(
		"retains an explicit host token equal to its global fallback value",
		async () => {
			const { provider } = fixture(
				"token: SAME_OWNED_FAKE\nhosts:\n  first.superset-test.invalid:\n    token: SAME_OWNED_FAKE\n",
			);
			expect(await provider().getToken("first.superset-test.invalid")).toBe(
				"SAME_OWNED_FAKE",
			);
		},
	);
	test
		.skipIf(!glab || !git)
		.each(["GIT_CONFIG_COUNT", "GIT_COMMON_DIR", "GIT_CONFIG_GLOBAL"])(
		"isolates inherited %s from the private fallback authority",
		async (key) => {
			const owned = fixture(
				"host: gitlab.com\ntoken: ROOT_OWNED_FAKE\nhosts:\n  first.superset-test.invalid:\n    token: HOST_OWNED_FAKE\n",
				"token: LOCAL_OWNED_FAKE\n",
			);
			const malformed = join(owned.dir, "malformed-git-config");
			writeFileSync(malformed, "[malformed\n", { mode: 0o600 });
			const value =
				key === "GIT_CONFIG_COUNT"
					? "invalid"
					: key === "GIT_COMMON_DIR"
						? join(owned.dir, "missing-common")
						: malformed;
			const extra = { [key]: value };
			const credentials = owned.provider(extra);
			expect(
				await credentials.getToken("unknown.superset-test.invalid"),
			).toBeNull();
			expect(await credentials.getToken("first.superset-test.invalid")).toBe(
				"HOST_OWNED_FAKE",
			);
			expect(extra[key]).toBe(value);
		},
	);
	test.skipIf(!glab || !git)(
		"retains a relative GLAB_CONFIG_DIR against caller cwd",
		async () => {
			const owned = fixture(
				"hosts:\n  first.superset-test.invalid:\n    token: RELATIVE_OWNED_FAKE\n",
			);
			const previousCwd = process.cwd();
			try {
				process.chdir(owned.dir);
				const extra = { GLAB_CONFIG_DIR: "." };
				expect(
					await owned.provider(extra).getToken("first.superset-test.invalid"),
				).toBe("RELATIVE_OWNED_FAKE");
				expect(extra.GLAB_CONFIG_DIR).toBe(".");
			} finally {
				process.chdir(previousCwd);
			}
		},
	);
});
