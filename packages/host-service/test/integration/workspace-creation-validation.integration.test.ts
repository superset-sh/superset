import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { TRPCClientError } from "@trpc/client";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

describe("workspaceCreation create/checkout input validation", () => {
	let host: TestHost;

	beforeEach(async () => {
		host = await createTestHost();
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("create rejects empty branchName at the procedure layer", async () => {
		await expect(
			host.trpc.workspaceCreation.create.mutate({
				pendingId: randomUUID(),
				projectId: randomUUID(),
				names: { workspaceName: "ws", branchName: "" },
				composer: {},
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("create rejects empty workspaceName at zod boundary", async () => {
		await expect(
			host.trpc.workspaceCreation.create.mutate({
				pendingId: randomUUID(),
				projectId: randomUUID(),
				names: { workspaceName: "", branchName: "feature/x" },
				composer: {},
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("create throws PROJECT_NOT_SETUP when project missing locally", async () => {
		await expect(
			host.trpc.workspaceCreation.create.mutate({
				pendingId: randomUUID(),
				projectId: randomUUID(),
				names: { workspaceName: "ws", branchName: "feature/x" },
				composer: {},
			}),
		).rejects.toThrow();
	});

	test("checkout requires exactly one of branch or pr (refine guard)", async () => {
		// Neither
		await expect(
			host.trpc.workspaceCreation.checkout.mutate({
				pendingId: randomUUID(),
				projectId: randomUUID(),
				workspaceName: "ws",
				composer: {},
			}),
		).rejects.toBeInstanceOf(TRPCClientError);

		// Both — also rejected
		await expect(
			host.trpc.workspaceCreation.checkout.mutate({
				pendingId: randomUUID(),
				projectId: randomUUID(),
				workspaceName: "ws",
				branch: "feature/x",
				pr: {
					number: 1,
					url: "https://github.com/o/r/pull/1",
					title: "t",
					headRefName: "h",
					baseRefName: "main",
					headRepositoryOwner: "o",
					isCrossRepository: false,
					state: "open",
				},
				composer: {},
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("checkout PR with negative number is rejected at zod boundary", async () => {
		await expect(
			host.trpc.workspaceCreation.checkout.mutate({
				pendingId: randomUUID(),
				projectId: randomUUID(),
				workspaceName: "ws",
				pr: {
					number: -1,
					url: "https://github.com/o/r/pull/1",
					title: "t",
					headRefName: "h",
					baseRefName: "main",
					headRepositoryOwner: "o",
					isCrossRepository: false,
					state: "open",
				},
				composer: {},
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("checkout throws PROJECT_NOT_SETUP for unknown projectId", async () => {
		await expect(
			host.trpc.workspaceCreation.checkout.mutate({
				pendingId: randomUUID(),
				projectId: randomUUID(),
				workspaceName: "ws",
				branch: "feature/x",
				composer: {},
			}),
		).rejects.toThrow();
	});
});
