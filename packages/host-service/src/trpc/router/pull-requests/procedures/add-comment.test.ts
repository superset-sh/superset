import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { HostServiceContext } from "../../../../types";
import { createCallerFactory, router } from "../../../index";
import * as projects from "../../workspace-creation/shared/project-helpers";
import * as gh from "../../workspace-creation/utils/exec-gh";
import { addComment } from "./add-comment";

const caller = createCallerFactory(router({ addComment }))({
	isAuthenticated: true,
} as HostServiceContext);

afterEach(() => mock.restore());

test("posts the trimmed body through the REST comments endpoint", async () => {
	spyOn(projects, "resolveGithubRepo").mockResolvedValue({
		owner: "owner",
		name: "repo",
		repoPath: "/unused",
	});
	const exec = spyOn(gh, "execGh").mockResolvedValue(
		"https://github.com/owner/repo/pull/12#issuecomment-1",
	);
	expect(
		await caller.addComment({ projectId: "p", prNumber: 12, body: "  LGTM  " }),
	).toEqual({ ok: true });
	expect(exec).toHaveBeenCalledWith(
		[
			"api",
			"--method",
			"POST",
			"repos/owner/repo/issues/12/comments",
			"--input",
			"-",
		],
		{ input: JSON.stringify({ body: "LGTM" }) },
	);
});

test("rejects an empty body before spawning gh", async () => {
	spyOn(projects, "resolveGithubRepo").mockResolvedValue({
		owner: "owner",
		name: "repo",
		repoPath: "/unused",
	});
	const exec = spyOn(gh, "execGh");
	await expect(
		caller.addComment({ projectId: "p", prNumber: 12, body: "   " }),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
	expect(exec).not.toHaveBeenCalled();
});
