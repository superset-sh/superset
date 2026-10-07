import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { readWorkspaceRefs } from "./workspace-refs";

const paths: string[] = [];
afterEach(() => {
	for (const path of paths.splice(0))
		rmSync(path, { recursive: true, force: true });
});
async function trackedRepo(url: string, remote = "origin") {
	const path = mkdtempSync(join(tmpdir(), "superset-workspace-refs-gitlab-"));
	paths.push(path);
	const git = simpleGit(path);
	await git.raw(["init", "--initial-branch=Feature"]);
	await git.raw([
		"-c",
		"user.name=user",
		"-c",
		"user.email=email@example.com",
		"commit",
		"--allow-empty",
		"-m",
		"fixture",
	]);
	await git.raw(["remote", "add", remote, url]);
	await git.raw(["config", "branch.Feature.remote", remote]);
	await git.raw(["config", "branch.Feature.merge", "refs/heads/Feature"]);
	return git;
}
test("real Git configuration retains nested GitLab namespace and branch case", async () => {
	const git = await trackedRepo("https://git.internal:8443/Team/Sub/Repo.git");
	expect((await readWorkspaceRefs(git)).upstream).toEqual({
		owner: "Team/Sub",
		name: "Repo",
		branch: "Feature",
		provider: "unknown",
		host: "git.internal:8443",
	});
});
test("real Git push config handles a dotted GitLab remote without network calls", async () => {
	const git = await trackedRepo(
		"git@gitlab.com:Team/Sub/Repo.git",
		"origin.host",
	);
	await git.raw(["config", "branch.Feature.pushRemote", "origin.host"]);
	expect((await readWorkspaceRefs(git)).upstream).toEqual({
		owner: "Team/Sub",
		name: "Repo",
		branch: "Feature",
		provider: "gitlab",
		host: "gitlab.com",
	});
});
test("GitHub workspace refs retain their existing normalization", async () => {
	const git = await trackedRepo("git@github.com:Team/Repo.git");
	expect((await readWorkspaceRefs(git)).upstream).toEqual({
		owner: "Team",
		name: "Repo",
		branch: "Feature",
		provider: "github",
		host: "github.com",
	});
});
