import { describe, expect, test } from "bun:test";
import { authorizeGitlabSandboxRequest } from "./sandbox-request";

const checkout = { projectId: 42, projectPath: "group/sub/repo" };
const authorize = (
	path: string,
	method = "GET",
	body?: string,
	contentType = "application/json",
) =>
	authorizeGitlabSandboxRequest({
		...checkout,
		path,
		method,
		body,
		contentType,
	});

describe("selected GitLab sandbox requests", () => {
	test.each([
		"git-upload-pack",
		"git-receive-pack",
	])("retains %s discovery and binary operation", (service) => {
		expect(
			authorize(`/group/sub/repo.git/info/refs?service=${service}`),
		).toEqual({
			kind: "git",
			path: `/group/sub/repo.git/info/refs?service=${service}`,
		});
		expect(
			authorize(
				`/group/sub/repo.git/${service}`,
				"POST",
				undefined,
				`application/x-${service}-request`,
			),
		).toEqual({ kind: "git", path: `/group/sub/repo.git/${service}` });
	});
	test.each([
		"42",
		"group%2Fsub%2Frepo",
		"group%2fsub%2frepo",
	])("canonicalizes the selected alias %s", (alias) => {
		expect(
			authorize(
				`/api/v4/projects/${alias}/merge_requests?state=all&source_branch=feature%2Fone&page=2`,
			),
		).toEqual({
			kind: "api",
			path: "/api/v4/projects/42/merge_requests?state=all&source_branch=feature%2Fone&page=2",
		});
	});
	test.each([
		"",
		"/repository/branches?search=feat&per_page=100",
		"/repository/branches/feature%2Fone",
		"/merge_requests/7",
		"/merge_requests/7/diffs",
		"/merge_requests/7/approvals",
		"/merge_requests/7/discussions",
		"/issues/3",
		"/pipelines?sha=abc123",
		"/pipelines/9/jobs",
		"/repository/commits/abc123/statuses",
	])("retains selected read %s", (suffix) => {
		expect(authorize(`/api/v4/projects/42${suffix}`).kind).toBe("api");
	});
	test("allows bounded native search and review facts only in the selected project", () => {
		for (const suffix of [
			"merge_requests?author_username=reviewer",
			"merge_requests/7/reviewers",
			"merge_requests/7/approval_state",
		]) {
			expect(authorize(`/api/v4/projects/42/${suffix}`).kind).toBe("api");
			expect(() => authorize(`/api/v4/projects/43/${suffix}`)).toThrow();
		}
		expect(() =>
			authorize(
				`/api/v4/projects/42/merge_requests?author_username=${"a".repeat(256)}`,
			),
		).toThrow();
	});
	test("classifies only selected job trace reads as plain text", () => {
		expect(authorize("/api/v4/projects/42/jobs/9/trace")).toEqual({
			kind: "api",
			responseType: "text",
			path: "/api/v4/projects/42/jobs/9/trace",
		});
		expect(() => authorize("/api/v4/projects/43/jobs/9/trace")).toThrow();
		expect(() =>
			authorize("/api/v4/projects/42/jobs/9/trace", "POST", "{}"),
		).toThrow();
	});
	test("permits scoped identity only", () => {
		expect(authorize("/api/v4/user")).toEqual({
			kind: "api",
			path: "/api/v4/user",
		});
		expect(() => authorize("/api/v4/users")).toThrow();
	});
	test("canonicalizes same-project creation and form updates", () => {
		const create = authorize(
			"/api/v4/projects/42/merge_requests",
			"POST",
			JSON.stringify({
				source_branch: "feature/one",
				target_branch: "main",
				target_project_id: 42,
				title: "Draft: Work",
				description: "Details",
			}),
		);
		expect(create.kind).toBe("api");
		expect(JSON.parse(create.body ?? "")).toEqual({
			source_branch: "feature/one",
			target_branch: "main",
			target_project_id: 42,
			title: "Draft: Work",
			description: "Details",
		});
		const update = authorize(
			"/api/v4/projects/42/merge_requests/7",
			"PUT",
			"state_event=reopen&title=Ready",
			"application/x-www-form-urlencoded",
		);
		expect(JSON.parse(update.body ?? "")).toEqual({
			state_event: "reopen",
			title: "Ready",
		});
	});
	test("requires current same-project ancestry before rebase", () => {
		expect(
			authorize("/api/v4/projects/42/merge_requests/7/rebase", "PUT", "{}"),
		).toEqual({
			kind: "api",
			path: "/api/v4/projects/42/merge_requests/7/rebase",
			body: "{}",
			sameProjectMr: 7,
		});
	});
	test("retains merge, thread resolution and reply", () => {
		expect(
			JSON.parse(
				authorize(
					"/api/v4/projects/42/merge_requests/7/merge",
					"PUT",
					'{"squash":true,"merge_commit_message":"ok"}',
				).body ?? "",
			),
		).toEqual({ squash: true, merge_commit_message: "ok" });
		expect(
			JSON.parse(
				authorize(
					"/api/v4/projects/42/merge_requests/7/discussions/abc123",
					"PUT",
					'{"resolved":false}',
				).body ?? "",
			),
		).toEqual({ resolved: false });
		expect(
			JSON.parse(
				authorize(
					"/api/v4/projects/42/merge_requests/7/discussions/abc123/notes",
					"POST",
					'{"body":"reply"}',
				).body ?? "",
			),
		).toEqual({ body: "reply" });
	});
	test("validates LFS batches and retains locking metadata", () => {
		const body = JSON.stringify({
			operation: "download",
			transfers: ["basic"],
			objects: [{ oid: "a".repeat(64), size: 123 }],
			ref: { name: "feature/one" },
		});
		expect(
			authorize(
				"/group/sub/repo.git/info/lfs/objects/batch",
				"POST",
				body,
				"application/vnd.git-lfs+json",
			),
		).toEqual({
			kind: "lfs-batch",
			path: "/group/sub/repo.git/info/lfs/objects/batch",
			body,
		});
		expect(authorize("/group/sub/repo.git/info/lfs/locks?limit=100").kind).toBe(
			"lfs-lock",
		);
		expect(
			authorize(
				"/group/sub/repo.git/info/lfs/locks/5/unlock",
				"POST",
				'{"force":false}',
				"application/vnd.git-lfs+json",
			).kind,
		).toBe("lfs-lock");
	});
	test.each([
		"%252e%252e%252fissues",
		"feature%252f%252e%252e%252f%252e%252e%252f43",
		"feature%255c%252e%252e%255c43",
	])("rejects nested structural branch escapes %s", (ref) => {
		expect(() =>
			authorize(`/api/v4/projects/42/repository/branches/${ref}`),
		).toThrow();
	});
	test.each([
		"release%25name",
		"feature%252Fone",
	])("retains literal percent branch %s", (ref) => {
		expect(
			authorize(`/api/v4/projects/42/repository/branches/${ref}`).path,
		).toBe(`/api/v4/projects/42/repository/branches/${ref}`);
	});
	test("retains encoded opaque discussion identities", () => {
		const path = "/api/v4/projects/42/merge_requests/7/discussions/disc%2Fid";
		expect(authorize(path, "PUT", '{"resolved":true}').path).toBe(path);
		expect(authorize(`${path}/notes`, "POST", '{"body":"reply"}').path).toBe(
			`${path}/notes`,
		);
	});
	test("emits schema-validated canonical numeric and boolean query fields", () => {
		expect(
			authorize(
				"/api/v4/projects/42/merge_requests?page=0x10&per_page=%20%2010",
			).path,
		).toBe("/api/v4/projects/42/merge_requests?page=16&per_page=10");
		expect(
			authorize("/api/v4/projects/42/merge_requests?page=1e2&per_page=%2B10")
				.path,
		).toBe("/api/v4/projects/42/merge_requests?page=100&per_page=10");
		expect(
			authorize(
				"/api/v4/projects/42/merge_requests/7?include_rebase_in_progress=false",
			).path,
		).toBe(
			"/api/v4/projects/42/merge_requests/7?include_rebase_in_progress=false",
		);
	});
	test("retains the standard nullable LFS ref", () => {
		const value = {
			operation: "download",
			objects: [{ oid: "a".repeat(64), size: 0 }],
			ref: null,
		};
		const plan = authorize(
			"/group/sub/repo.git/info/lfs/objects/batch",
			"POST",
			JSON.stringify(value),
			"application/vnd.git-lfs+json",
		);
		expect(JSON.parse(plan.body ?? "")).toEqual(value);
	});
	test("selects basic from a valid offered adapter list", () => {
		const value = {
			operation: "upload",
			transfers: ["custom-adapter", "basic"],
			objects: [{ oid: "a".repeat(64), size: 0 }],
		};
		const plan = authorize(
			"/group/sub/repo.git/info/lfs/objects/batch",
			"POST",
			JSON.stringify(value),
			"application/vnd.git-lfs+json",
		);
		expect(JSON.parse(plan.body ?? "")).toEqual({
			...value,
			transfers: ["basic"],
		});
		expect(() =>
			authorize(
				"/group/sub/repo.git/info/lfs/objects/batch",
				"POST",
				JSON.stringify({ ...value, transfers: ["custom-adapter"] }),
				"application/vnd.git-lfs+json",
			),
		).toThrow();
	});
	test.each([
		"/other/repo.git/info/refs?service=git-upload-pack",
		"/group/sub/repo.wiki.git/git-upload-pack",
		"/group/sub/repo.git/info/refs?service=other",
		"/group/sub/repo.git/info/refs?service=git-upload-pack&service=git-receive-pack",
		"/group/sub/repo.git/git-upload-pack?access_token=secret",
		"/api/v4/projects/43",
		"/api/v4/projects/group%252Fsub%252Frepo",
		"/api/v4/projects/group%2Fother",
		"/api/v4/projects/042",
		"/api/v4/projects/42/access_tokens",
		"/api/v4/projects/42/merge_requests?sudo=123",
		"/api/v4/projects/42/merge_requests?private_token=secret",
		"/api/v4/projects/42/merge_requests?access_token%5B%5D=secret",
		"/api/v4/projects/42/merge_requests?page=1&page=2",
		"/api/v4/projects/42/repository/branches/%2e%2e",
		"/api/v4/projects/42/repository/branches/a%2F..%2Fb",
		"/api/v4/projects/42//merge_requests",
		"/api/v4/projects/42/../43",
		"/api/v4/projects/42/merge_requests#fragment",
		"/api/v4/projects/42/merge_requests%00",
		"/api/v4/graphql",
		`/gitlab-lfs/objects/${"a".repeat(64)}`,
		"/group/sub/repo.git/info/lfs/objects/batch?token=secret",
	])("rejects unauthorized raw route %s", (path) => {
		expect(() => authorize(path)).toThrow();
	});
	test.each([
		{
			source_branch: "feat",
			target_branch: "main",
			title: "ok",
			target_project_id: 43,
		},
		{
			source_branch: "feat",
			target_branch: "main",
			title: "ok",
			source_project_id: 43,
		},
		{ source_branch: "feat", target_branch: "main", title: "ok", sudo: 1 },
		{
			source_branch: "feat",
			target_branch: "main",
			title: "ok",
			access_token: "secret",
		},
		{
			source_branch: "feat",
			target_branch: "main",
			title: "ok",
			remove_source_branch: true,
		},
		{ source_branch: "../bad", target_branch: "main", title: "ok" },
	])("rejects unreviewed creation semantics %j", (body) => {
		expect(() =>
			authorize(
				"/api/v4/projects/42/merge_requests",
				"POST",
				JSON.stringify(body),
			),
		).toThrow();
	});
	test.each([
		"DELETE",
		"PATCH",
		"CONNECT",
	])("rejects unreviewed method %s", (method) => {
		expect(() => authorize("/api/v4/projects/42", method)).toThrow();
	});
	test("rejects bad mutation framing without reflecting credentials", () => {
		for (const [body, type] of [
			["[]", "application/json"],
			["{", "application/json"],
			["title=one&title=two", "application/x-www-form-urlencoded"],
			["secret", "multipart/form-data"],
			["x".repeat(1048577), "application/json"],
		]) {
			expect(() =>
				authorize("/api/v4/projects/42/merge_requests/7", "PUT", body, type),
			).toThrow("Unsupported GitLab sandbox request");
		}
		expect(() =>
			authorize("/api/v4/projects/42/merge_requests/7", "GET", "{}"),
		).toThrow();
	});
	test.each([
		{ operation: "download", objects: [{ oid: "bad", size: 123 }] },
		{ operation: "upload", objects: [{ oid: "a".repeat(64), size: -1 }] },
		{ operation: "other", objects: [] },
		{ operation: "download", objects: [], access_token: "secret" },
	])("rejects invalid LFS batch %j", (body) => {
		expect(() =>
			authorize(
				"/group/sub/repo.git/info/lfs/objects/batch",
				"POST",
				JSON.stringify(body),
				"application/vnd.git-lfs+json",
			),
		).toThrow();
	});
});

test("verified fork reads cannot expand beyond its MR head or mutate the source", () => {
	const fork = {
		projectId: 43,
		projectPath: "fork/repo",
		headSha: "a".repeat(40),
	};
	const input = { ...checkout, fork, method: "GET" };
	expect(
		authorizeGitlabSandboxRequest({
			...input,
			path: `/api/v4/projects/43/pipelines?sha=${fork.headSha}`,
		}),
	).toMatchObject({ kind: "api" });
	expect(() =>
		authorizeGitlabSandboxRequest({
			...input,
			path: "/api/v4/projects/43/pipelines",
		}),
	).toThrow();
	expect(() =>
		authorizeGitlabSandboxRequest({
			...input,
			path: "/api/v4/projects/43/issues/3",
		}),
	).toThrow();
	expect(() =>
		authorizeGitlabSandboxRequest({
			...input,
			path: "/api/v4/projects/43/merge_requests/7",
			method: "PUT",
			body: "{}",
			contentType: "application/json",
		}),
	).toThrow();
});
