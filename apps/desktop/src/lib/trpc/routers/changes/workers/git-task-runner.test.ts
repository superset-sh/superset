import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import {
	WorkerTaskAbortedError,
	WorkerTaskError,
} from "../../../workers/WorkerTaskRunner";
import { GitEnvironmentError } from "../../workspaces/utils/git-errors";
import { translateGitTaskFailure } from "./git-task-runner";

function capture(error: unknown): unknown {
	try {
		translateGitTaskFailure(error);
	} catch (thrown) {
		return thrown;
	}
	throw new Error("translateGitTaskFailure must throw");
}

describe("translateGitTaskFailure", () => {
	test("a worker crash stays a raw WorkerTaskError so the boundary reports it", () => {
		const crash = new WorkerTaskError("Worker exited with code 1");
		expect(capture(crash)).toBe(crash);
	});

	test("a worker-thrown error that only shares the abort name stays raw", () => {
		const impostor = new WorkerTaskError("boom", {
			name: "WorkerTaskAbortedError",
			message: "boom",
		});
		expect(capture(impostor)).toBe(impostor);
	});

	test("a timeout is still an environment error", () => {
		const timeout = new WorkerTaskError(
			'[changes-git] Task "getStatus" timed out after 45000ms',
		);
		expect(capture(timeout)).toBeInstanceOf(GitEnvironmentError);
	});

	test("an abort on quit is a non-500 with the original message", () => {
		const thrown = capture(
			new WorkerTaskAbortedError("disposed", "Worker runner disposed"),
		);
		expect(thrown).toBeInstanceOf(TRPCError);
		expect((thrown as TRPCError).code).toBe("SERVICE_UNAVAILABLE");
		expect((thrown as TRPCError).message).toBe("Worker runner disposed");
	});

	test("a superseded task is a client-closed request", () => {
		const thrown = capture(
			new WorkerTaskAbortedError(
				"superseded",
				"Task superseded by a newer request",
			),
		);
		expect((thrown as TRPCError).code).toBe("CLIENT_CLOSED_REQUEST");
	});

	test("a caller-cancelled task is a client-closed request", () => {
		const thrown = capture(new WorkerTaskAbortedError("cancelled"));
		expect((thrown as TRPCError).code).toBe("CLIENT_CLOSED_REQUEST");
		expect((thrown as TRPCError).message).toBe("Worker task aborted");
	});
});
