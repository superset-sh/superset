import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { writeAuth } from "./write-auth";

function errnoError(code: string): NodeJS.ErrnoException {
	return Object.assign(new Error(`${code}: token file write failed`), {
		code,
	});
}

async function rejectionOf(run: () => Promise<unknown>): Promise<unknown> {
	try {
		await run();
	} catch (error) {
		return error;
	}
	throw new Error("expected the write to reject");
}

describe("writeAuth", () => {
	test("passes a successful write through", async () => {
		expect(await writeAuth(async () => "saved")).toBe("saved");
	});

	test("a full disk is the user's environment, not a bug", async () => {
		const error = await rejectionOf(() =>
			writeAuth(() => Promise.reject(errnoError("ENOSPC"))),
		);

		expect(error).toBeInstanceOf(TRPCError);
		expect((error as TRPCError).code).toBe("PRECONDITION_FAILED");
	});

	test("a write lock that never frees up is still reported as a bug", async () => {
		const locked = errnoError("ELOCKED");

		expect(
			await rejectionOf(() => writeAuth(() => Promise.reject(locked))),
		).toBe(locked);
	});

	test("an error without an errno is still reported as a bug", async () => {
		const exhausted = new Error("Organization membership revision exhausted");

		expect(
			await rejectionOf(() => writeAuth(() => Promise.reject(exhausted))),
		).toBe(exhausted);
	});
});
