import { expect, test } from "bun:test";
import { readGitlabConfig } from "./config";

const config = {
	provider: "gitlab",
	host: "Git.Example.Invalid:8443",
	groupPath: "acme/sub",
	auth: "oauth",
	webhookSecret: "FAKE_SECRET",
	scopeKind: "group",
	scopeId: "17",
};
test("stored GitLab configuration normalizes origin and preserves verified scope", () => {
	expect(readGitlabConfig(config)).toEqual({
		...config,
		host: "git.example.invalid:8443",
	});
	expect(
		readGitlabConfig({
			...config,
			groupPath: null,
			scopeKind: undefined,
			scopeId: undefined,
		}),
	).toEqual({
		...config,
		host: "git.example.invalid:8443",
		groupPath: null,
		scopeKind: undefined,
		scopeId: undefined,
	});
});
test("invalid stored origins and scope shapes cannot select credentials", () => {
	for (const value of [
		null,
		[],
		{ ...config, provider: "github" },
		{ ...config, auth: "invalid" },
		{ ...config, webhookSecret: 1 },
		{ ...config, groupPath: { path: "acme" } },
		{ ...config, groupPath: "acme/../other" },
		{ ...config, groupPath: "acme%2Fsub" },
		{ ...config, groupPath: "acme/\u0000/sub" },
		{ ...config, groupPath: "acme/\u007f/sub" },
		{ ...config, groupPath: "Acme", scopeKind: "project" },
		{ ...config, groupPath: "Acme", scopeKind: undefined },
		{ ...config, scopeKind: "invalid" },
		{ ...config, scopeId: "0" },
		{ ...config, scopeId: "9007199254740992" },
		{ ...config, host: "git.example.invalid/other" },
		{ ...config, host: "http://git.example.invalid" },
		{ ...config, host: "user:pass@git.example.invalid" },
	])
		expect(readGitlabConfig(value)).toBeNull();
});
