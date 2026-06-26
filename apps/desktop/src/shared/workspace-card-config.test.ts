import { describe, expect, it } from "bun:test";
import {
	commandSetHash,
	DEFAULT_WORKSPACE_CARD_CONFIG,
	parseWorkspaceCardConfig,
	workspaceCardConfigsEqual,
} from "./workspace-card-config";

describe("parseWorkspaceCardConfig", () => {
	it("defaults every field to true and custom lines to empty", () => {
		expect(DEFAULT_WORKSPACE_CARD_CONFIG).toEqual({
			prTitle: true,
			prChecks: true,
			diffStats: true,
			status: true,
			linearTicket: true,
			customLines: [],
		});
	});

	it("returns defaults for a missing block", () => {
		expect(parseWorkspaceCardConfig(undefined)).toEqual(
			DEFAULT_WORKSPACE_CARD_CONFIG,
		);
	});

	it("fills unspecified fields with defaults", () => {
		expect(parseWorkspaceCardConfig({ prTitle: false })).toEqual({
			...DEFAULT_WORKSPACE_CARD_CONFIG,
			prTitle: false,
		});
	});

	it("falls back to defaults for malformed input", () => {
		expect(parseWorkspaceCardConfig({ prTitle: "yes" })).toEqual(
			DEFAULT_WORKSPACE_CARD_CONFIG,
		);
		expect(parseWorkspaceCardConfig("nonsense")).toEqual(
			DEFAULT_WORKSPACE_CARD_CONFIG,
		);
	});

	it("parses a bare custom line as a command line (back-compat)", () => {
		const parsed = parseWorkspaceCardConfig({
			customLines: [{ id: "a", label: "last", command: "git log -1" }],
		});
		expect(parsed.customLines).toEqual([
			{
				id: "a",
				type: "command",
				label: "last",
				command: "git log -1",
				enabled: true,
			},
		]);
	});

	it("parses a component line", () => {
		const parsed = parseWorkspaceCardConfig({
			customLines: [{ id: "b", type: "component", component: "pomodoro" }],
		});
		expect(parsed.customLines).toEqual([
			{
				id: "b",
				type: "component",
				label: "",
				component: "pomodoro",
				enabled: true,
			},
		]);
	});

	it("parses mixed command and component lines", () => {
		const parsed = parseWorkspaceCardConfig({
			customLines: [
				{ id: "a", command: "echo hi" },
				{ id: "b", type: "component", component: "clock", enabled: false },
			],
		});
		expect(parsed.customLines).toHaveLength(2);
		expect(parsed.customLines[0].type).toBe("command");
		expect(parsed.customLines[1]).toMatchObject({
			type: "component",
			component: "clock",
			enabled: false,
		});
	});

	it("falls back to defaults when a component line is invalid", () => {
		// type says component but no component key — neither variant matches.
		expect(
			parseWorkspaceCardConfig({
				customLines: [{ id: "c", type: "component", command: "echo hi" }],
			}),
		).toEqual(DEFAULT_WORKSPACE_CARD_CONFIG);
	});
});

describe("workspaceCardConfigsEqual", () => {
	const base = parseWorkspaceCardConfig({
		customLines: [
			{ id: "a", label: "last", command: "git log -1" },
			{ id: "b", type: "component", component: "pomodoro" },
		],
	});

	it("matches identical configs", () => {
		expect(
			workspaceCardConfigsEqual(
				DEFAULT_WORKSPACE_CARD_CONFIG,
				parseWorkspaceCardConfig({}),
			),
		).toBe(true);
		expect(
			workspaceCardConfigsEqual(base, parseWorkspaceCardConfig(base)),
		).toBe(true);
	});

	it("detects boolean field differences", () => {
		expect(workspaceCardConfigsEqual(base, { ...base, diffStats: false })).toBe(
			false,
		);
	});

	it("detects custom line differences", () => {
		expect(workspaceCardConfigsEqual(base, { ...base, customLines: [] })).toBe(
			false,
		);
		expect(
			workspaceCardConfigsEqual(base, {
				...base,
				customLines: [
					{ ...base.customLines[0] },
					{
						id: "b",
						type: "component",
						label: "",
						component: "clock",
						enabled: true,
					},
				],
			}),
		).toBe(false);
	});

	it("treats command vs component lines with the same id as different", () => {
		const a = parseWorkspaceCardConfig({
			customLines: [{ id: "x", command: "date" }],
		});
		const b = parseWorkspaceCardConfig({
			customLines: [{ id: "x", type: "component", component: "clock" }],
		});
		expect(workspaceCardConfigsEqual(a, b)).toBe(false);
	});
});

describe("commandSetHash", () => {
	it("returns the same hash for the same commands regardless of line order", () => {
		const a = parseWorkspaceCardConfig({
			customLines: [
				{ id: "1", command: "date" },
				{ id: "2", command: "git log -1" },
			],
		});
		const b = parseWorkspaceCardConfig({
			customLines: [
				{ id: "2", command: "git log -1" },
				{ id: "1", command: "date" },
			],
		});
		expect(commandSetHash(a)).toBe(commandSetHash(b));
	});

	it("returns different hashes when command strings differ", () => {
		const a = parseWorkspaceCardConfig({
			customLines: [{ id: "1", command: "date" }],
		});
		const b = parseWorkspaceCardConfig({
			customLines: [{ id: "1", command: "echo hello" }],
		});
		expect(commandSetHash(a)).not.toBe(commandSetHash(b));
	});

	it("ignores disabled command lines", () => {
		const withDisabled = parseWorkspaceCardConfig({
			customLines: [
				{ id: "1", command: "date" },
				{ id: "2", command: "git log -1", enabled: false },
			],
		});
		const withoutDisabled = parseWorkspaceCardConfig({
			customLines: [{ id: "1", command: "date" }],
		});
		expect(commandSetHash(withDisabled)).toBe(commandSetHash(withoutDisabled));
	});

	it("ignores component lines", () => {
		const withComponent = parseWorkspaceCardConfig({
			customLines: [
				{ id: "1", command: "date" },
				{ id: "2", type: "component", component: "clock" },
			],
		});
		const withoutComponent = parseWorkspaceCardConfig({
			customLines: [{ id: "1", command: "date" }],
		});
		expect(commandSetHash(withComponent)).toBe(
			commandSetHash(withoutComponent),
		);
	});

	it("returns a stable value for empty command set", () => {
		expect(commandSetHash(DEFAULT_WORKSPACE_CARD_CONFIG)).toBe(
			commandSetHash(parseWorkspaceCardConfig({})),
		);
	});
});
