import { describe, expect, test } from "bun:test";
import type { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../types";
import { createCallerFactory, publicProcedure, router } from "./index";

const testRouter = router({
	readDir: publicProcedure.query(() => {
		throw Object.assign(
			new Error("EPERM: operation not permitted, scandir '/drive/repo'"),
			{ code: "EPERM", syscall: "scandir", path: "/drive/repo" },
		);
	}),
	gitStatus: publicProcedure.query(() => {
		throw new Error(
			"fatal: Unable to read current working directory: Operation not permitted",
		);
	}),
	crash: publicProcedure.query(() => {
		throw new Error("boom");
	}),
});

const caller = createCallerFactory(testRouter)(
	{} as unknown as HostServiceContext,
);

async function errorOf(call: () => Promise<unknown>): Promise<TRPCError> {
	try {
		await call();
	} catch (err) {
		return err as TRPCError;
	}
	throw new Error("expected the call to fail");
}

describe("permission errors at the tRPC boundary", () => {
	test("an fs permission error becomes FORBIDDEN naming the path", async () => {
		const err = await errorOf(() => caller.readDir());
		expect(err.code).toBe("FORBIDDEN");
		expect(err.message).toContain(
			"does not have permission to read /drive/repo",
		);
	});

	test("a git permission failure becomes FORBIDDEN", async () => {
		const err = await errorOf(() => caller.gitStatus());
		expect(err.code).toBe("FORBIDDEN");
		expect(err.message).toContain("does not have permission to read");
	});

	test("other errors stay internal", async () => {
		const err = await errorOf(() => caller.crash());
		expect(err.code).toBe("INTERNAL_SERVER_ERROR");
	});
});
