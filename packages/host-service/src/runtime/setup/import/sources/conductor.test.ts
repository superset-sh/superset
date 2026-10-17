import { describe, expect, it } from "bun:test";
import { buildCandidate } from "../plan";
import { parseConductor } from "./conductor";
import { readerFor } from "./test-utils";

describe("parseConductor", () => {
	it("maps setup, run, and archive + teardown", () => {
		const candidate = buildCandidate(
			parseConductor(
				readerFor({
					"conductor.json": JSON.stringify({
						scripts: {
							setup: 'bun install\ncp "$CONDUCTOR_ROOT_PATH/.env" .env',
							run: "bun dev",
							archive: "docker compose down",
							teardown: "rm -rf .turbo",
						},
						runScriptMode: "nonconcurrent",
						enterpriseDataPrivacy: true,
					}),
				}),
			),
		);
		expect(candidate?.scripts).toEqual({
			setup: {
				commands: ["bun install", 'cp "$SUPERSET_ROOT_PATH/.env" .env'],
			},
			teardown: { commands: ["docker compose down", "rm -rf .turbo"] },
			run: { commands: ["bun dev"] },
		});
		expect(candidate?.notImported.map((entry) => entry.field)).toEqual([
			"runScriptMode",
			"enterpriseDataPrivacy",
		]);
	});

	it("reports a script that is not a string", () => {
		const parsed = parseConductor(
			readerFor({ "conductor.json": '{"scripts":{"setup":["bun i"]}}' }),
		);
		expect(parsed?.notImported).toEqual([
			{
				file: "conductor.json",
				field: "scripts.setup",
				reason: "invalid-value",
			},
		]);
	});

	it("ignores a missing or malformed file", () => {
		expect(parseConductor(readerFor({}))).toBeNull();
		expect(parseConductor(readerFor({ "conductor.json": "{" }))).toBeNull();
	});
});
