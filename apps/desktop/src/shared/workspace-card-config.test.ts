import { describe, expect, it } from "bun:test";
import {
	commandSetHash,
	DEFAULT_WORKSPACE_CARD_CONFIG,
	enabledWidgetFiles,
	parseWorkspaceCardConfig,
	workspaceCardConfigsEqual,
	workspaceCardTrustHash,
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

	it("parses a widget line", () => {
		const parsed = parseWorkspaceCardConfig({
			customLines: [
				{ id: "w", type: "widget", file: "widgets/ci.tsx", label: "CI" },
			],
		});
		expect(parsed.customLines).toEqual([
			{
				id: "w",
				type: "widget",
				label: "CI",
				file: "widgets/ci.tsx",
				enabled: true,
			},
		]);
	});

	it("keeps legacy command/component lines parsing alongside widget lines", () => {
		const parsed = parseWorkspaceCardConfig({
			customLines: [
				{ id: "a", command: "echo hi" },
				{ id: "b", type: "component", component: "clock" },
				{ id: "w", type: "widget", file: "widgets/x.tsx" },
			],
		});
		expect(parsed.customLines).toHaveLength(3);
		expect(parsed.customLines[0].type).toBe("command");
		expect(parsed.customLines[1].type).toBe("component");
		expect(parsed.customLines[2]).toMatchObject({
			type: "widget",
			file: "widgets/x.tsx",
		});
	});

	it("rejects widget files that traverse with .. (falls back to defaults)", () => {
		expect(
			parseWorkspaceCardConfig({
				customLines: [
					{ id: "w", type: "widget", file: "../../etc/passwd.tsx" },
				],
			}),
		).toEqual(DEFAULT_WORKSPACE_CARD_CONFIG);
	});

	it("rejects widget files nested .. segments", () => {
		expect(
			parseWorkspaceCardConfig({
				customLines: [{ id: "w", type: "widget", file: "widgets/../../x.tsx" }],
			}),
		).toEqual(DEFAULT_WORKSPACE_CARD_CONFIG);
	});

	it("rejects absolute widget file paths (leading /)", () => {
		expect(
			parseWorkspaceCardConfig({
				customLines: [{ id: "w", type: "widget", file: "/abs/x.tsx" }],
			}),
		).toEqual(DEFAULT_WORKSPACE_CARD_CONFIG);
	});

	it("allows a normal widgets/<name>.tsx path", () => {
		const parsed = parseWorkspaceCardConfig({
			customLines: [{ id: "w", type: "widget", file: "widgets/deploy.tsx" }],
		});
		expect(parsed.customLines[0]).toMatchObject({
			type: "widget",
			file: "widgets/deploy.tsx",
		});
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

	it("includes widget file references in the hash", () => {
		const a = parseWorkspaceCardConfig({
			customLines: [{ id: "w", type: "widget", file: "widgets/a.tsx" }],
		});
		const b = parseWorkspaceCardConfig({
			customLines: [{ id: "w", type: "widget", file: "widgets/b.tsx" }],
		});
		expect(commandSetHash(a)).not.toBe(commandSetHash(b));
	});

	it("ignores disabled widget lines", () => {
		const withDisabled = parseWorkspaceCardConfig({
			customLines: [
				{ id: "w", type: "widget", file: "widgets/a.tsx", enabled: false },
			],
		});
		expect(commandSetHash(withDisabled)).toBe(
			commandSetHash(DEFAULT_WORKSPACE_CARD_CONFIG),
		);
	});
});

describe("enabledWidgetFiles", () => {
	it("lists only enabled widget files, sorted", () => {
		const config = parseWorkspaceCardConfig({
			customLines: [
				{ id: "1", type: "widget", file: "widgets/z.tsx" },
				{ id: "2", type: "widget", file: "widgets/a.tsx" },
				{ id: "3", type: "widget", file: "widgets/x.tsx", enabled: false },
				{ id: "4", command: "echo hi" },
			],
		});
		expect(enabledWidgetFiles(config)).toEqual([
			"widgets/a.tsx",
			"widgets/z.tsx",
		]);
	});
});

describe("workspaceCardTrustHash", () => {
	const config = parseWorkspaceCardConfig({
		customLines: [
			{ id: "w", type: "widget", file: "widgets/a.tsx" },
			{ id: "c", command: "date" },
		],
	});

	it("changes when a widget file's contents change (re-arms trust)", () => {
		const before = workspaceCardTrustHash(config, {
			"widgets/a.tsx": "export default function Widget(){return null}",
		});
		const after = workspaceCardTrustHash(config, {
			"widgets/a.tsx": "export default function Widget(){return 'changed'}",
		});
		expect(before).not.toBe(after);
	});

	it("is stable for identical config + identical file contents", () => {
		const contents = { "widgets/a.tsx": "source" };
		expect(workspaceCardTrustHash(config, contents)).toBe(
			workspaceCardTrustHash(config, { ...contents }),
		);
	});

	it("treats a missing widget file (null) distinctly from empty", () => {
		const missing = workspaceCardTrustHash(config, { "widgets/a.tsx": null });
		const present = workspaceCardTrustHash(config, {
			"widgets/a.tsx": "x",
		});
		expect(missing).not.toBe(present);
	});

	it("changes when an underlying command changes too", () => {
		const other = parseWorkspaceCardConfig({
			customLines: [
				{ id: "w", type: "widget", file: "widgets/a.tsx" },
				{ id: "c", command: "echo changed" },
			],
		});
		const contents = { "widgets/a.tsx": "source" };
		expect(workspaceCardTrustHash(config, contents)).not.toBe(
			workspaceCardTrustHash(other, contents),
		);
	});
});
