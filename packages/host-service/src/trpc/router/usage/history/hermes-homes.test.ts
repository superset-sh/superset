import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hermesHomes } from "./hermes-homes";

let home: string;
afterEach(() => rmSync(home, { recursive: true, force: true }));

function makeHome(): string {
	home = realpathSync(mkdtempSync(join(tmpdir(), "hermes-homes-")));
	mkdirSync(join(home, ".hermes", "profiles", "coder"), { recursive: true });
	return home;
}

describe("hermesHomes", () => {
	test("lists the default home and each profile", () => {
		makeHome();
		expect(hermesHomes(home, {}).sort()).toEqual([
			join(home, ".hermes"),
			join(home, ".hermes", "profiles", "coder"),
		]);
	});

	test("counts HERMES_HOME once when it names a listed home another way", () => {
		makeHome();
		symlinkSync(join(home, ".hermes"), join(home, "hermes-link"));
		for (const HERMES_HOME of [
			`${join(home, ".hermes")}/`,
			join(home, "hermes-link"),
			"~/.hermes",
		]) {
			expect(hermesHomes(home, { HERMES_HOME })).toHaveLength(2);
		}
	});

	test("expands ~ in HERMES_HOME and skips homes that do not exist", () => {
		makeHome();
		mkdirSync(join(home, "work-hermes"));
		expect(hermesHomes(home, { HERMES_HOME: "~/work-hermes" })).toContain(
			join(home, "work-hermes"),
		);
		expect(hermesHomes(home, { HERMES_HOME: "~/missing" })).toHaveLength(2);
	});
});
