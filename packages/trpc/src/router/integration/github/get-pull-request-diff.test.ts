import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import { db } from "@superset/db/client";
import { PgDialect } from "drizzle-orm/pg-core";
import * as github from "../../../lib/sandbox/clone-token";
import {
	createCallerFactory,
	createTRPCRouter,
	type TRPCContext,
} from "../../../trpc";
import * as membership from "../utils";
import { getPullRequestDiff } from "./get-pull-request-diff";

const organizationId = "00000000-0000-4000-8000-000000000001";
const createCaller = createCallerFactory(
	createTRPCRouter({ getPullRequestDiff }),
);
const caller = createCaller({
	headers: new Headers(),
	client: null,
	sandboxCaller: null,
	session: {
		user: { id: "user" },
		session: { activeOrganizationId: organizationId },
	},
} as TRPCContext);
const input = { organizationId, repoFullName: "OWNER/Repo", number: 12 };
const request = mock(async (_route: string, _options: unknown) => ({
	data: "diff --git a/a b/a",
}));

beforeEach(() => {
	spyOn(membership, "verifyOrgMembership").mockResolvedValue({
		membership: {},
	} as Awaited<ReturnType<typeof membership.verifyOrgMembership>>);
	spyOn(db.query.githubInstallations, "findFirst").mockResolvedValue({
		id: "installation-row",
		installationId: "123",
	} as Awaited<ReturnType<typeof db.query.githubInstallations.findFirst>>);
	spyOn(db.query.githubRepositories, "findFirst").mockResolvedValue({
		fullName: "owner/repo",
	} as Awaited<ReturnType<typeof db.query.githubRepositories.findFirst>>);
	request.mockReset().mockResolvedValue({ data: "diff --git a/a b/a" });
	spyOn(github, "installationOctokit").mockResolvedValue({
		request,
	} as unknown as Awaited<ReturnType<typeof github.installationOctokit>>);
});

afterEach(() => {
	mock.restore();
});

describe("integration.github.getPullRequestDiff", () => {
	test("fetches a diff for an installed repository without a synced PR row", async () => {
		expect(await caller.getPullRequestDiff(input)).toEqual({
			patch: "diff --git a/a b/a",
		});
		expect(membership.verifyOrgMembership).toHaveBeenCalledWith(
			"user",
			organizationId,
		);
		expect(github.installationOctokit).toHaveBeenCalledWith("123");
		expect(request).toHaveBeenCalledWith(
			"GET /repos/{owner}/{repo}/pulls/{pull_number}",
			{
				owner: "owner",
				repo: "repo",
				pull_number: 12,
				headers: { accept: "application/vnd.github.diff" },
			},
		);
		const repoLookup = spyOn(db.query.githubRepositories, "findFirst").mock
			.calls[0]?.[0];
		expect(
			new PgDialect().sqlToQuery(repoLookup?.where as import("drizzle-orm").SQL)
				.params,
		).toEqual(["installation-row", "owner/repo"]);
	});

	test("rejects nonmembers before looking up the installation or contacting GitHub", async () => {
		spyOn(membership, "verifyOrgMembership").mockRejectedValue(
			new Error("Not a member"),
		);
		await expect(caller.getPullRequestDiff(input)).rejects.toThrow(
			"Not a member",
		);
		expect(db.query.githubInstallations.findFirst).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
	});

	test("rejects repositories outside the organization's installation", async () => {
		spyOn(db.query.githubRepositories, "findFirst").mockResolvedValue(
			undefined,
		);
		await expect(caller.getPullRequestDiff(input)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(github.installationOctokit).not.toHaveBeenCalled();
	});

	test("reports missing installations", async () => {
		spyOn(db.query.githubInstallations, "findFirst").mockResolvedValue(
			undefined,
		);
		await expect(caller.getPullRequestDiff(input)).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
		expect(request).not.toHaveBeenCalled();
	});

	test("surfaces GitHub failures", async () => {
		request.mockRejectedValue(new Error("GitHub unavailable"));
		await expect(caller.getPullRequestDiff(input)).rejects.toThrow(
			"GitHub unavailable",
		);
	});
});
