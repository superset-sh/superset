import { afterEach, beforeEach, expect, test } from "bun:test";
import { GitLabProviderClient } from "./gitlab-provider-client";

const host = "gl.example.test:8443",
	repo = { owner: "Team", name: "Widget" },
	sha = "a".repeat(40);
const selected = {
	id: 7,
	path_with_namespace: "Team/Widget",
	http_url_to_repo: `https://${host}/Team/Widget.git`,
};
const mr = {
	iid: 12,
	project_id: 7,
	source_project_id: 7,
	target_project_id: 7,
	source_branch: "Feature",
	target_branch: "main",
	sha,
	title: "Feature",
	state: "opened",
	web_url: `https://${host}/Team/Widget/-/merge_requests/12`,
};
let selectedValue: unknown,
	mrValue: unknown,
	sourceValue: unknown,
	sourceStatus = 200;
const requests: string[] = [];
const original = globalThis.fetch;
const client = new GitLabProviderClient({
	host,
	token: async () => "FAKE_NATIVE_TOKEN",
});
beforeEach(() => {
	selectedValue = selected;
	mrValue = mr;
	sourceValue = {
		id: 8,
		path_with_namespace: "People/Fork",
		http_url_to_repo: `https://${host}/People/Fork.git`,
	};
	sourceStatus = 200;
	requests.length = 0;
	globalThis.fetch = Object.assign(
		async (input: string | URL | Request, init?: RequestInit) => {
			const path = new URL(String(input)).pathname;
			expect(new Headers(init?.headers).get("authorization")).toBe(
				"Bearer FAKE_NATIVE_TOKEN",
			);
			expect(init?.redirect).toBe("error");
			requests.push(path);
			return Response.json(
				path.endsWith("/merge_requests/12")
					? mrValue
					: path.endsWith("/projects/8")
						? sourceValue
						: selectedValue,
				{ status: path.endsWith("/projects/8") ? sourceStatus : 200 },
			);
		},
		{ preconnect: original.preconnect },
	);
});
afterEach(() => {
	globalThis.fetch = original;
});
function verified() {
	return client.fetchVerifiedPullRequestMetadata(repo, 12);
}
test("verified native checkout binds selected project and current MR source-target facts", async () => {
	expect(await verified()).toMatchObject({
		provider: "gitlab",
		host,
		number: 12,
		projectId: "7",
		sourceProjectId: "7",
		targetProjectId: "7",
		headRefOid: sha,
		headRefName: "Feature",
		isCrossRepository: false,
	});
	expect(requests).toEqual([
		"/api/v4/projects/Team%2FWidget",
		"/api/v4/projects/Team%2FWidget/merge_requests/12",
	]);
});
test("missing source or wrong target/instance metadata never becomes a nonfork checkout", async () => {
	for (const value of [
		{ ...mr, source_project_id: undefined },
		{ ...mr, target_project_id: 8 },
		{ ...mr, iid: 13 },
		{ ...mr, sha: "invalid" },
		{ ...mr, web_url: "https://other.test/Team/Widget/-/merge_requests/12" },
	]) {
		mrValue = value;
		await expect(verified()).rejects.toMatchObject({ status: 502 });
	}
});
test("fork metadata and deleted fork recovery remain explicit and exact-instance", async () => {
	mrValue = { ...mr, source_project_id: 8 };
	expect(await verified()).toMatchObject({
		sourceProjectId: "8",
		targetProjectId: "7",
		isCrossRepository: true,
		headRepositoryUrl: `https://${host}/People/Fork.git`,
	});
	sourceStatus = 404;
	expect(await verified()).toMatchObject({
		isCrossRepository: true,
		headRepositoryUrl: null,
	});
	sourceStatus = 200;
	sourceValue = {
		id: 8,
		path_with_namespace: "People/Fork",
		http_url_to_repo: "https://other.test/People/Fork.git",
	};
	await expect(verified()).rejects.toMatchObject({ status: 502 });
	mrValue = { ...mr, source_project_id: null };
	expect(await verified()).toMatchObject({
		sourceProjectId: null,
		isCrossRepository: true,
		headRepositoryUrl: null,
	});
});
