import { describe, expect, it } from "bun:test";
import { buildCandidate } from "../plan";
import { parseT3 } from "./t3";
import { readerFor } from "./test-utils";

const t3Json = (scripts: unknown[], extra: object = {}) =>
	readerFor({ "t3.json": JSON.stringify({ scripts, ...extra }) });

describe("parseT3", () => {
	it("joins every runOnWorktreeCreate script into setup, in order", () => {
		const candidate = buildCandidate(
			parseT3(
				t3Json([
					{
						name: "Install",
						command: "bun install",
						runOnWorktreeCreate: true,
					},
					{
						name: "Env",
						command:
							'cp "$T3CODE_PROJECT_ROOT/.env" "$T3CODE_WORKTREE_PATH/.env"',
						runOnWorktreeCreate: true,
					},
				]),
			),
		);
		expect(candidate?.scripts.setup?.commands).toEqual([
			"bun install",
			'cp "$SUPERSET_ROOT_PATH/.env" "$SUPERSET_WORKSPACE_PATH/.env"',
		]);
	});

	it("uses the first play script as run and reports the others", () => {
		const parsed = parseT3(
			t3Json([
				{ name: "Test", command: "bun test", icon: "test" },
				{
					name: "Dev",
					command: "bun dev",
					previewUrl: "http://localhost:3000",
				},
				{ name: "Storybook", command: "bun storybook", icon: "play" },
			]),
		);
		expect(parsed?.scripts.run).toEqual(["bun dev"]);
		expect(parsed?.notImported).toEqual([
			{ file: "t3.json", field: 'scripts["Test"]', reason: "extra-command" },
			{
				file: "t3.json",
				field: 'scripts["Dev"].previewUrl',
				reason: "no-equivalent",
			},
			{
				file: "t3.json",
				field: 'scripts["Storybook"]',
				reason: "extra-command",
			},
		]);
	});

	it("reports the async flag on a setup script", () => {
		const parsed = parseT3(
			t3Json([
				{
					name: "Install",
					command: "bun i",
					runOnWorktreeCreate: true,
					async: false,
				},
			]),
		);
		expect(parsed?.notImported.map((entry) => entry.field)).toEqual([
			'scripts["Install"].async',
		]);
	});
});
