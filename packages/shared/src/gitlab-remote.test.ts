import { describe, expect, test } from "bun:test";
import { parseGitLabRemote } from "./gitlab-remote";

describe("parseGitLabRemote", () => {
	test.each([
		["git@gitlab.com:group/sub/app.git", "gitlab.com/group/sub"],
		["git@git.example.com:team/app.git", "git.example.com/team"],
		["ssh://git@ssh.example.com:2222/team/app.git", "ssh.example.com/team"],
		["https://git.example.com:8443/team/app/", "git.example.com:8443/team"],
	])("parses %s", (remote, owner) => {
		expect(parseGitLabRemote(remote)).toEqual({
			provider: "gitlab",
			owner,
			name: "app",
			url: `https://${owner}/app`,
		});
	});

	test("ignores what is not a hosted repository", () => {
		expect(parseGitLabRemote("/srv/repos/app.git")).toBeNull();
		expect(parseGitLabRemote("git@git.example.com:app.git")).toBeNull();
	});
});
