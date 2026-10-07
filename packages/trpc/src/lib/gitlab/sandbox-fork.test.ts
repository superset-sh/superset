import { expect, test } from "bun:test";
import { gitlabForkReadTarget, verifyGitlabForkRead } from "./sandbox-fork";

const base = {
	origin: "https://git.example",
	token: "FIXTURE",
	selectedProjectId: 7,
	projectId: 8,
	mergeRequest: 9,
	path: "/api/v4/projects/8/pipelines/10/jobs",
};
test("fork context grants only verified source CI reads for the selected MR head", async () => {
	const head = "a".repeat(40);
	const send = async (_origin: string, _token: string, path: string) =>
		Response.json(
			path.endsWith("merge_requests/9")
				? { iid: 9, target_project_id: 7, source_project_id: 8, sha: head }
				: path.endsWith("pipelines/10")
					? { id: 10, project_id: 8, sha: head }
					: {
							id: 8,
							path_with_namespace: "fork/repo",
							http_url_to_repo: "https://git.example/fork/repo.git",
						},
		);
	expect(await verifyGitlabForkRead({ ...base, send })).toEqual({
		projectId: 8,
		projectPath: "fork/repo",
		headSha: head,
	});
	await expect(
		verifyGitlabForkRead({
			...base,
			send: async (origin, token, path) =>
				path.endsWith("pipelines/10")
					? Response.json({ id: 10, project_id: 8, sha: "b".repeat(40) })
					: send(origin, token, path),
		}),
	).rejects.toThrow();
	expect(gitlabForkReadTarget(base.path, "GET", "9")).toEqual({
		projectId: 8,
		mergeRequest: 9,
	});
	for (const path of [
		"/api/v4/projects/8/access_tokens",
		"/api/v4/projects/8/issues",
		"/api/v4/projects/fork%2Frepo/pipelines",
	])
		expect(gitlabForkReadTarget(path, "GET", "9")).toBeNull();
	expect(gitlabForkReadTarget(base.path, "PUT", "9")).toBeNull();
});
