import {
	afterAll,
	beforeEach,
	describe,
	expect,
	setSystemTime,
	test,
} from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isFirstReportToday } from "./analytics";

const tempDir = mkdtempSync(join(tmpdir(), "superset-cli-analytics-"));
const reportedPath = join(tempDir, "reported-commands.json");

function report(command: string) {
	return isFirstReportToday(command, reportedPath);
}

beforeEach(() => {
	rmSync(reportedPath, { force: true });
	setSystemTime(new Date("2026-09-29T12:00:00Z"));
});

afterAll(() => {
	setSystemTime();
	rmSync(tempDir, { recursive: true, force: true });
});

describe("isFirstReportToday", () => {
	test("allows a command once per day", () => {
		expect(report("terminals list")).toBe(true);
		expect(report("terminals list")).toBe(false);
		expect(report("terminals list")).toBe(false);
	});

	test("tracks each command separately", () => {
		expect(report("terminals list")).toBe(true);
		expect(report("terminals read")).toBe(true);
		expect(report("terminals list")).toBe(false);
	});

	test("allows the command again on the next UTC day", () => {
		expect(report("status")).toBe(true);
		setSystemTime(new Date("2026-09-30T00:00:01Z"));
		expect(report("status")).toBe(true);
		expect(report("status")).toBe(false);
	});

	test("starts over when the file holds something unexpected", () => {
		for (const contents of [
			"null",
			"not json",
			'{"day":"2026-09-29","commands":"status"}',
		]) {
			writeFileSync(reportedPath, contents);
			expect(report("status")).toBe(true);
			expect(report("status")).toBe(false);
		}
	});

	test("allows every call when the file cannot be written", () => {
		const unwritable = join(tempDir, "missing-dir", "reported-commands.json");
		expect(isFirstReportToday("status", unwritable)).toBe(true);
		expect(isFirstReportToday("status", unwritable)).toBe(true);
	});
});
