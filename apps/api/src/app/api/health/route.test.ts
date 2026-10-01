import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

let execute: () => Promise<unknown> = async () => [];

mock.module("@superset/db/client", () => ({
	db: { execute: () => execute() },
}));

const { GET } = await import("./route");

describe("GET /api/health", () => {
	beforeEach(() => {
		execute = async () => [];
	});

	test("returns 200 when the database answers", async () => {
		const response = await GET();
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ ok: true, database: "ok" });
	});

	test("returns 503 when the database query fails", async () => {
		const consoleError = spyOn(console, "error").mockImplementation(() => {});
		execute = async () => {
			throw new Error("connection refused");
		};
		const response = await GET();
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({
			ok: false,
			database: "error",
		});
		consoleError.mockRestore();
	});

	test("returns 503 when the database does not answer in time", async () => {
		execute = () => new Promise(() => {});
		const response = await GET();
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({
			ok: false,
			database: "timeout",
		});
	}, 10_000);
});
