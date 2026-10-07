import { afterEach, expect, mock, test } from "bun:test";
import { readFileSync, unlinkSync } from "node:fs";
import { parseGitRemote } from "@superset/shared/git-remote";
import { detectRepoProvider } from "../../../runtime/repo-providers/detect-repo-provider";
import { GitLabProviderClient } from "../../../runtime/repo-providers/gitlab/gitlab-provider-client";
import { CloudGitCredentialProvider } from "./CloudGitCredentialProvider";

const nativeFetch = globalThis.fetch;
const askpassFiles = new Set<string>();
afterEach(() => {
	globalThis.fetch = nativeFetch;
	for (const path of askpassFiles) unlinkSync(path);
	askpassFiles.clear();
});
function provider() {
	return new CloudGitCredentialProvider(async () => ({
		token: "FIXTURE_GITHUB_ORG_TOKEN",
		expiresAt: Date.now() + 60000,
	}));
}
test("cloud GitHub token is restricted to github.com before and after caching", async () => {
	const credentials = provider();
	for (const host of [
		"gitlab.com",
		"git.internal:8443",
		"github.com.evil.test",
		"github.com:8443",
	])
		expect(await credentials.getToken(host)).toBeNull();
	expect(await credentials.getToken("github.com")).toBe(
		"FIXTURE_GITHUB_ORG_TOKEN",
	);
	expect(await credentials.getToken("GITHUB.COM")).toBe(
		"FIXTURE_GITHUB_ORG_TOKEN",
	);
	for (const host of ["gitlab.com", "git.internal:8443"])
		expect(await credentials.getToken(host)).toBeNull();
});
test("cloud credentials cannot authenticate GitLab runtime requests or custom metadata retries", async () => {
	const credentials = provider();
	const token = (host: string) => credentials.getToken(host);
	const sentTokens: Array<string | null> = [];
	globalThis.fetch = mock(async (_url, init) => {
		const authorization = new Headers(init?.headers).get("Authorization");
		sentTokens.push(authorization);
		return authorization
			? Response.json({ version: "18.1.2", revision: "abcdef1234" })
			: new Response("", { status: 401 });
	}) as unknown as typeof fetch;
	const client = new GitLabProviderClient({
		host: "gitlab.com",
		token: () => token("gitlab.com"),
	});
	await expect(
		client.fetchPullRequestMetadata({ owner: "Team", name: "Repo" }, 7),
	).rejects.toThrow("No GitLab token");
	const remote = parseGitRemote("https://git.internal:8443/Team/Repo.git");
	if (!remote) throw new Error("Invalid fixture remote");
	expect(
		await detectRepoProvider(remote, { getGitLabToken: token }),
	).toBeNull();
	expect(sentTokens).toEqual([null]);
});

async function trackedCredentials(
	credentials: CloudGitCredentialProvider,
	remote: string | null,
) {
	const result = await credentials.getCredentials(remote);
	if (result.env.GIT_ASKPASS) askpassFiles.add(result.env.GIT_ASKPASS);
	return result;
}
const deniedRemotes = [
	null,
	"https://gitlab.com/Team/Repo.git",
	"https://git.internal:8443/Team/Repo.git",
	"https://github.com.evil.test/Team/Repo.git",
	"https://github.com:8443/Team/Repo.git",
	"http://github.com/Team/Repo.git",
	"https://user:pass@github.com/Team/Repo.git",
	"https://github.com@evil.test/Team/Repo.git",
	"https://evil.test@github.com/Team/Repo.git",
	"https://github.com./Team/Repo.git",
	"ssh://git@gitlab.com/Team/Repo.git",
	"git@gitlab.com:Team/Repo.git",
	"ssh://git@github.com:2222/Team/Repo.git",
	"file:///github.com/Team/Repo.git",
	"not-a-remote",
	"https://github.com\\@evil.test/Team/Repo.git",
	"https://github.com /Team/Repo.git",
];
test("cold cloud askpass denies foreign origins and malformed remotes before token fetching", async () => {
	let requested = false;
	const credentials = new CloudGitCredentialProvider(async () => {
		requested = true;
		return { token: "FIXTURE_GITHUB_ORG_TOKEN", expiresAt: Date.now() + 60000 };
	});
	for (const remote of deniedRemotes)
		expect(await trackedCredentials(credentials, remote)).toEqual({
			env: { GIT_TERMINAL_PROMPT: "0" },
		});
	expect(requested).toBe(false);
});
test("warm cloud GitHub askpass is never exposed to another origin", async () => {
	const credentials = provider();
	const original = await trackedCredentials(
		credentials,
		"https://github.com/Team/Repo.git",
	);
	const path = original.env.GIT_ASKPASS;
	if (!path) throw new Error("GitHub fixture askpass missing");
	expect(readFileSync(path, "utf8")).toContain("FIXTURE_GITHUB_ORG_TOKEN");
	for (const remote of deniedRemotes)
		expect(await trackedCredentials(credentials, remote)).toEqual({
			env: { GIT_TERMINAL_PROMPT: "0" },
		});
	expect(
		await trackedCredentials(credentials, "https://github.com/Team/Repo.git"),
	).toEqual(original);
});
test("GitHub HTTPS origin and the original supported SSH forms retain cold and cached askpass", async () => {
	for (const remote of [
		"https://github.com/Team/Repo.git",
		"https://GITHUB.COM:443/Team/Repo.git",
		"git@github.com:Team/Repo.git",
		"ssh://git@github.com/Team/Repo.git",
	]) {
		const credentials = provider();
		const initial = await trackedCredentials(credentials, remote);
		expect(initial.env.GIT_TERMINAL_PROMPT).toBe("0");
		expect(initial.env.GIT_ASKPASS).toBeDefined();
		expect(await trackedCredentials(credentials, remote)).toEqual(initial);
	}
});
