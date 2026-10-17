import { describe, expect, test } from "bun:test";
import type { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../types";
import { createCallerFactory, publicProcedure, router } from "./index";
import { requireProjectRepoPath } from "./router/workspace-creation/shared/local-project";

const missingRepoPath = "/nonexistent/superset-test/acme-web";

const testRouter = router({
	branches: publicProcedure.query(() =>
		requireProjectRepoPath({ repoPath: missingRepoPath } as Parameters<
			typeof requireProjectRepoPath
		>[0]),
	),
});

describe("tRPC error formatter", () => {
	test("sends a missing project folder to the client as data.projectDirMissing", async () => {
		const caller = createCallerFactory(testRouter)(
			{} as unknown as HostServiceContext,
		);
		const error = await caller.branches().then(
			() => {
				throw new Error("expected the call to fail");
			},
			(err: TRPCError) => err,
		);
		const shape = testRouter._def._config.errorFormatter({
			shape: {
				message: error.message,
				code: -32004,
				data: { code: "NOT_FOUND", httpStatus: 404, path: "branches" },
			},
			error,
			type: "query",
			path: "branches",
			input: undefined,
			ctx: undefined,
		});
		expect(error.code).toBe("NOT_FOUND");
		expect(shape.data.projectDirMissing).toEqual({
			kind: "PROJECT_DIR_MISSING",
			repoPath: missingRepoPath,
		});
	});
});
