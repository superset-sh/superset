import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { HostServiceContext } from "../../../../types";
import { createCallerFactory, router } from "../../../index";
import * as projects from "../../workspace-creation/shared/project-helpers";
import * as gh from "../../workspace-creation/utils/exec-gh";
import * as sync from "../shared/sync-after-write";
import { setDraft } from "./set-draft";

const caller = createCallerFactory(router({ setDraft }))({
	isAuthenticated: true,
} as HostServiceContext);

afterEach(() => mock.restore());

test("ready runs gh pr ready and records the write", async () => {
	spyOn(projects, "resolveGithubRepo").mockResolvedValue({
		owner: "owner",
		name: "repo",
		repoPath: "/unused",
	});
	const exec = spyOn(gh, "execGh").mockResolvedValue("");
	const synced = spyOn(sync, "syncPullRequestAfterWrite").mockResolvedValue();
	expect(
		await caller.setDraft({ projectId: "p", prNumber: 12, draft: false }),
	).toEqual({ ok: true });
	expect(exec).toHaveBeenCalledWith([
		"pr",
		"ready",
		"12",
		"--repo",
		"owner/repo",
	]);
	expect(synced).toHaveBeenCalledWith(expect.anything(), {
		repo: { owner: "owner", name: "repo", repoPath: "/unused" },
		prNumber: 12,
		action: "ready",
	});
});

test("draft runs gh pr ready --undo", async () => {
	spyOn(projects, "resolveGithubRepo").mockResolvedValue({
		owner: "owner",
		name: "repo",
		repoPath: "/unused",
	});
	const exec = spyOn(gh, "execGh").mockResolvedValue("");
	spyOn(sync, "syncPullRequestAfterWrite").mockResolvedValue();
	await caller.setDraft({ projectId: "p", prNumber: 12, draft: true });
	expect(exec).toHaveBeenCalledWith([
		"pr",
		"ready",
		"--undo",
		"12",
		"--repo",
		"owner/repo",
	]);
});
