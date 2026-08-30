import { describe, expect, it } from "bun:test";
import { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../../../types";
import { gitRouter } from "./git";

const ACTIONS_URL =
	"https://github.com/acme/widgets/actions/runs/42/job/123456";

function createCaller(opts: {
	workspace?: { pullRequestId: string | null; worktreePath?: string };
	pr?: {
		repoOwner: string;
		repoName: string;
		repoProvider?: "github" | "gitlab";
		url?: string;
	};
	logs?: string;
}) {
	const downloadCalls: Array<{ owner: string; repo: string; job_id: number }> =
		[];
	const ctx = {
		isAuthenticated: true,
		db: {
			query: {
				workspaces: {
					findFirst: () => ({ sync: () => opts.workspace }),
				},
				pullRequests: {
					findFirst: () => ({ sync: () => opts.pr }),
				},
			},
		},
		github: async () => ({
			rest: {
				actions: {
					downloadJobLogsForWorkflowRun: async (args: {
						owner: string;
						repo: string;
						job_id: number;
					}) => {
						downloadCalls.push(args);
						return { data: opts.logs ?? "" };
					},
				},
			},
		}),
		execGlab: async (args: string[], options?: { cwd?: string }) => {
			downloadCalls.push({
				owner: args.join(" "),
				repo: options?.cwd ?? "",
				job_id: -1,
			});
			return opts.logs ?? "";
		},
	} as unknown as HostServiceContext;
	return { caller: gitRouter.createCaller(ctx), downloadCalls };
}

async function expectTrpcError(
	promise: Promise<unknown>,
	code: TRPCError["code"],
) {
	try {
		await promise;
		throw new Error("expected the call to reject");
	} catch (error) {
		expect(error).toBeInstanceOf(TRPCError);
		expect((error as TRPCError).code).toBe(code);
	}
}

describe("gitRouter.getCheckJobLogs", () => {
	it("downloads logs for the PR's repo using the job id from the URL", async () => {
		const { caller, downloadCalls } = createCaller({
			workspace: { pullRequestId: "pr-1", worktreePath: "/tmp" },
			pr: { repoOwner: "acme", repoName: "widgets" },
			logs: "::group::build\nboom\n::endgroup::",
		});

		const result = await caller.getCheckJobLogs({
			workspaceId: "ws-1",
			detailsUrl: ACTIONS_URL,
		});

		expect(result.logs).toBe("::group::build\nboom\n::endgroup::");
		expect(downloadCalls).toEqual([
			{ owner: "acme", repo: "widgets", job_id: 123456 },
		]);
	});

	it("downloads GitLab CI logs from the linked MR repository", async () => {
		const { caller, downloadCalls } = createCaller({
			workspace: { pullRequestId: "pr-1", worktreePath: "/tmp" },
			pr: {
				repoOwner: "acme",
				repoName: "widgets",
				repoProvider: "gitlab",
				url: "https://gitlab.com/acme/widgets/-/merge_requests/42",
			},
			logs: "build failed",
		});

		const result = await caller.getCheckJobLogs({
			workspaceId: "ws-1",
			detailsUrl: "https://gitlab.com/acme/widgets/-/jobs/123456",
		});

		expect(result.logs).toBe("build failed");
		expect(downloadCalls).toEqual([
			{
				owner: "api --method GET projects/acme%2Fwidgets/jobs/123456/trace",
				repo: "/tmp",
				job_id: -1,
			},
		]);
	});

	it("rejects URLs that are not hosted on github.com", async () => {
		const { caller, downloadCalls } = createCaller({
			workspace: { pullRequestId: "pr-1" },
			pr: { repoOwner: "acme", repoName: "widgets" },
		});

		await expectTrpcError(
			caller.getCheckJobLogs({
				workspaceId: "ws-1",
				detailsUrl: "https://evil.example.com/acme/widgets/job/999",
			}),
			"BAD_REQUEST",
		);
		expect(downloadCalls).toHaveLength(0);
	});

	it("rejects github URLs without a job id", async () => {
		const { caller } = createCaller({
			workspace: { pullRequestId: "pr-1" },
			pr: { repoOwner: "acme", repoName: "widgets" },
		});

		await expectTrpcError(
			caller.getCheckJobLogs({
				workspaceId: "ws-1",
				detailsUrl: "https://github.com/acme/widgets/runs/42",
			}),
			"BAD_REQUEST",
		);
	});

	it("returns NOT_FOUND when the workspace has no pull request", async () => {
		const { caller } = createCaller({ workspace: { pullRequestId: null } });

		await expectTrpcError(
			caller.getCheckJobLogs({ workspaceId: "ws-1", detailsUrl: ACTIONS_URL }),
			"NOT_FOUND",
		);
	});
});
