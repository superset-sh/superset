import {
	afterEach,
	beforeEach,
	describe,
	expect,
	type Mock,
	spyOn,
	test,
} from "bun:test";
import { checkDatabase, healthResponse } from "./checkDatabase";

let consoleError: Mock<typeof console.error>;

beforeEach(() => {
	consoleError = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	consoleError.mockRestore();
});

describe("checkDatabase", () => {
	test("returns ok when the query answers", async () => {
		expect(await checkDatabase(async () => [], 1000)).toBe("ok");
		expect(consoleError).not.toHaveBeenCalled();
	});

	test("returns error and logs when the query fails", async () => {
		const failure = new Error("connection refused");
		expect(
			await checkDatabase(async () => {
				throw failure;
			}, 1000),
		).toBe("error");
		expect(consoleError).toHaveBeenCalledWith(
			"[health] database check failed",
			failure,
		);
	});

	test("returns timeout when the query does not answer in time", async () => {
		expect(await checkDatabase(() => new Promise(() => {}), 20)).toBe(
			"timeout",
		);
	});

	test("logs a query that fails after the timeout", async () => {
		const failure = new Error("late failure");
		let rejectQuery: (error: Error) => void = () => {};
		const result = await checkDatabase(
			() =>
				new Promise((_, reject) => {
					rejectQuery = reject;
				}),
			20,
		);
		expect(result).toBe("timeout");

		rejectQuery(failure);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(consoleError).toHaveBeenCalledWith(
			"[health] database check failed",
			failure,
		);
	});
});

describe("healthResponse", () => {
	test("returns 200 when the database is ok", async () => {
		const response = healthResponse("ok", 12);
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(await response.json()).toEqual({
			ok: true,
			database: "ok",
			latencyMs: 12,
		});
	});

	test.each([
		"timeout",
		"error",
	] as const)("returns 503 when the database is %s", async (database) => {
		const response = healthResponse(database, 3000);
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ ok: false, database });
	});
});
