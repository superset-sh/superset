import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { HostServiceContext } from "../../../../types";
import { createCallerFactory, router } from "../../../index";
import * as gh from "../../workspace-creation/utils/exec-gh";
import { getDiffByRepo } from "./get-diff-by-repo";

const createCaller = createCallerFactory(router({ getDiffByRepo }));
const caller = createCaller({
	isAuthenticated: true,
} as HostServiceContext);

afterEach(() => {
	mock.restore();
});

describe("pullRequests.getDiffByRepo", () => {
	test("fetches from the requested repository without a project or checkout", async () => {
		const exec = spyOn(gh, "execGh").mockResolvedValue("diff --git a/a b/a");
		expect(
			await caller.getDiffByRepo({ repoFullName: "other/repo", prNumber: 12 }),
		).toEqual({ patch: "diff --git a/a b/a" });
		expect(exec).toHaveBeenCalledWith(
			["pr", "diff", "12", "--repo", "other/repo"],
			{ timeout: 30_000, maxBuffer: 200 * 1024 * 1024 },
		);
	});

	test("rejects malformed repository identities before invoking gh", async () => {
		const exec = spyOn(gh, "execGh").mockResolvedValue("");
		for (const repoFullName of [
			"repo",
			"owner/repo/extra",
			"--repo other/repo",
		]) {
			await expect(
				caller.getDiffByRepo({ repoFullName, prNumber: 12 }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		}
		expect(exec).not.toHaveBeenCalled();
	});

	test("requires host authentication", async () => {
		const exec = spyOn(gh, "execGh").mockResolvedValue("");
		const unauthenticated = createCaller({
			isAuthenticated: false,
		} as HostServiceContext);
		await expect(
			unauthenticated.getDiffByRepo({
				repoFullName: "owner/repo",
				prNumber: 12,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(exec).not.toHaveBeenCalled();
	});

	test("propagates gh failures so the client can use the API fallback", async () => {
		spyOn(gh, "execGh").mockRejectedValue(new Error("gh not authenticated"));
		await expect(
			caller.getDiffByRepo({ repoFullName: "owner/repo", prNumber: 12 }),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});
});
