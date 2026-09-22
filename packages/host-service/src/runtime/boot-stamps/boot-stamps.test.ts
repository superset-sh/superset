import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	parseBootStamps,
	readBootStamps,
	recordBootStamp,
} from "./boot-stamps";

describe("parseBootStamps", () => {
	it("returns the stamps of the last boot in order, keeps a phase's detail out, and skips the runner's own lines", () => {
		const log = [
			"1789000000000 boot.start pid=1 bundle=abc",
			"1789000000100 host.exec",
			"1789000005000 boot.start pid=2 bundle=abc",
			"1789000005010 run.cleared",
			"1789000005020 setup apply-rootfs installed=0 skipped=26",
			"1789000005030 checkout.cloned https://github.com/superset-sh/superset.git",
			"1789000005900 host.exec 1.29.0",
			"",
		].join("\n");
		expect(parseBootStamps(log)).toEqual([
			{ phase: "boot.start", at: 1789000005000 },
			{ phase: "run.cleared", at: 1789000005010 },
			{ phase: "checkout.cloned", at: 1789000005030 },
			{ phase: "host.exec", at: 1789000005900 },
		]);
	});

	it("is empty for an empty or malformed log", () => {
		expect(parseBootStamps("")).toEqual([]);
		expect(parseBootStamps("not a stamp\n123 short\n")).toEqual([]);
	});
});

describe("recordBootStamp", () => {
	let dir: string;
	const previous = process.env.SUPERSET_SANDBOX_BOOT_LOG;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "boot-stamps-"));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
		if (previous === undefined) delete process.env.SUPERSET_SANDBOX_BOOT_LOG;
		else process.env.SUPERSET_SANDBOX_BOOT_LOG = previous;
	});

	it("appends to the boot log the script started and reads it back", () => {
		const path = join(dir, "boot.log");
		process.env.SUPERSET_SANDBOX_BOOT_LOG = path;
		recordBootStamp("boot.start", 1789000000000);
		recordBootStamp("host.listening", 1789000004321);
		expect(readFileSync(path, "utf8")).toBe(
			"1789000000000 boot.start\n1789000004321 host.listening\n",
		);
		expect(readBootStamps()).toEqual([
			{ phase: "boot.start", at: 1789000000000 },
			{ phase: "host.listening", at: 1789000004321 },
		]);
	});

	it("records nothing without a boot log", () => {
		delete process.env.SUPERSET_SANDBOX_BOOT_LOG;
		recordBootStamp("host.listening");
		expect(readBootStamps()).toEqual([]);
	});
});
