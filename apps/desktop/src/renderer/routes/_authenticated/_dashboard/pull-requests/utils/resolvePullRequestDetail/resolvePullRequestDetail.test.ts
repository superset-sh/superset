import { describe, expect, it } from "bun:test";
import type { PullRequestDetail } from "../../hooks/usePullRequestDetail";
import { resolvePullRequestDetail } from "./resolvePullRequestDetail";

const detail = {
	number: 7,
	title: "Add pane",
	body: "",
	url: "https://github.com/o/r/pull/7",
	state: "open",
	branch: "feat",
	baseBranch: "main",
	headRepositoryOwner: "o",
	isCrossRepository: false,
	author: "kiet",
	isDraft: false,
	createdAt: undefined,
	updatedAt: undefined,
	checks: [],
	checksStatus: "none",
} as unknown as PullRequestDetail;

const ready = {
	prNumber: 7,
	projectId: "project-1",
	areProjectsReady: true,
	hasProject: true,
	hostUrl: "http://127.0.0.1:1",
	isLoading: false,
	error: null,
	data: detail,
	refetch: () => {},
};

describe("resolvePullRequestDetail", () => {
	it("is ready once the host, project, and fetched detail all line up", () => {
		const result = resolvePullRequestDetail(ready);
		expect(result.status).toBe("ready");
		if (result.status !== "ready") return;
		expect(result.data).toBe(detail);
		expect(result.projectId).toBe("project-1");
		expect(result.hostUrl).toBe("http://127.0.0.1:1");
	});

	it("rejects a malformed PR number before anything else", () => {
		const result = resolvePullRequestDetail({
			...ready,
			prNumber: null,
			projectId: null,
		});
		expect(result).toMatchObject({ status: "fallback", isError: true });
		expect(result.status === "fallback" && result.message).toContain("invalid");
	});

	it("asks for a project when none is selected", () => {
		const result = resolvePullRequestDetail({ ...ready, projectId: null });
		expect(result.status).toBe("fallback");
		expect(result.status === "fallback" && result.isError).toBeFalsy();
	});

	it("shows a loading placeholder while projects are still arriving", () => {
		const loading = resolvePullRequestDetail({
			...ready,
			hasProject: false,
			areProjectsReady: false,
		});
		expect(loading).toMatchObject({ status: "fallback", isLoading: true });

		const gone = resolvePullRequestDetail({
			...ready,
			hasProject: false,
			areProjectsReady: true,
		});
		expect(gone).toMatchObject({ status: "fallback", isError: true });
	});

	it("reports an unreachable host", () => {
		const result = resolvePullRequestDetail({ ...ready, hostUrl: null });
		expect(result).toMatchObject({ status: "fallback", isError: true });
		expect(result.status === "fallback" && result.onRetry).toBeUndefined();
	});

	it("offers a retry when the fetch fails or returns nothing", () => {
		const refetch = () => {};
		const failed = resolvePullRequestDetail({
			...ready,
			error: new Error("boom"),
			refetch,
		});
		expect(failed).toMatchObject({
			status: "fallback",
			isError: true,
			message: "boom",
		});
		expect(failed.status === "fallback" && failed.onRetry).toBe(refetch);

		const empty = resolvePullRequestDetail({ ...ready, data: null, refetch });
		expect(empty).toMatchObject({ status: "fallback", isError: true });
		expect(empty.status === "fallback" && empty.onRetry).toBe(refetch);
	});

	it("keeps loading ahead of a stale error", () => {
		const result = resolvePullRequestDetail({
			...ready,
			isLoading: true,
			error: new Error("old"),
			data: null,
		});
		expect(result).toMatchObject({ status: "fallback", isLoading: true });
	});
});
