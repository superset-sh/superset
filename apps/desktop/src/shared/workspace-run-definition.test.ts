import { describe, expect, it } from "bun:test";
import {
	planWorkspaceRunLaunch,
	selectWorkspaceRunDefinition,
} from "./workspace-run-definition";

describe("selectWorkspaceRunDefinition", () => {
	it("prefers a project-targeted workspace-run preset over config", () => {
		const definition = selectWorkspaceRunDefinition({
			projectId: "project-a",
			configRunCommands: ["bun dev"],
			presets: [
				{
					id: "preset-a",
					name: "Project dev",
					commands: ["pnpm dev"],
					projectIds: ["project-a"],
					useAsWorkspaceRun: true,
				},
			],
		});

		expect(definition).toEqual({
			source: "terminal-preset",
			presetId: "preset-a",
			name: "Project dev",
			commands: ["pnpm dev"],
		});
	});

	it("uses config before a global workspace-run preset", () => {
		const definition = selectWorkspaceRunDefinition({
			projectId: "project-a",
			configRunCommands: ["bun dev"],
			presets: [
				{
					id: "preset-global",
					name: "Global dev",
					commands: ["npm run dev"],
					projectIds: null,
					useAsWorkspaceRun: true,
				},
			],
		});

		expect(definition).toEqual({
			source: "project-config",
			projectId: "project-a",
			commands: ["bun dev"],
		});
	});

	it("preserves config cwd", () => {
		const definition = selectWorkspaceRunDefinition({
			projectId: "project-a",
			configRunCommands: ["bun dev"],
			configCwd: "apps/web",
			presets: [],
		});

		expect(definition).toEqual({
			source: "project-config",
			projectId: "project-a",
			commands: ["bun dev"],
			cwd: "apps/web",
		});
	});

	it("falls back to a global workspace-run preset when config is empty", () => {
		const definition = selectWorkspaceRunDefinition({
			projectId: "project-a",
			configRunCommands: ["   "],
			presets: [
				{
					id: "preset-global",
					name: "Global dev",
					commands: ["npm run dev"],
					useAsWorkspaceRun: true,
				},
			],
		});

		expect(definition).toEqual({
			source: "terminal-preset",
			presetId: "preset-global",
			name: "Global dev",
			commands: ["npm run dev"],
		});
	});

	it("carries the preset's execution mode", () => {
		const definition = selectWorkspaceRunDefinition({
			projectId: "project-a",
			presets: [
				{
					id: "preset-a",
					name: "Dev servers",
					commands: ["bun run backend", "bun run frontend"],
					executionMode: "new-tab-split-pane",
					projectIds: ["project-a"],
					useAsWorkspaceRun: true,
				},
			],
		});

		expect(definition).toEqual({
			source: "terminal-preset",
			presetId: "preset-a",
			name: "Dev servers",
			commands: ["bun run backend", "bun run frontend"],
			executionMode: "new-tab-split-pane",
		});
	});
});

describe("planWorkspaceRunLaunch", () => {
	const preset = {
		source: "terminal-preset" as const,
		presetId: "preset-a",
		name: "Dev servers",
		commands: ["bun run backend", "bun run frontend"],
	};

	it("returns null without a definition or commands", () => {
		expect(planWorkspaceRunLaunch(null)).toBeNull();
		expect(planWorkspaceRunLaunch({ ...preset, commands: [] })).toBeNull();
	});

	it("chains project config commands in one terminal", () => {
		expect(
			planWorkspaceRunLaunch({
				source: "project-config",
				projectId: "project-a",
				commands: ["bun install", "bun dev"],
			}),
		).toEqual({ layout: "single", commands: ["bun install && bun dev"] });
	});

	it("chains a sequential script in one terminal", () => {
		expect(
			planWorkspaceRunLaunch({ ...preset, executionMode: "sequential" }),
		).toEqual({
			layout: "single",
			commands: ["bun run backend && bun run frontend"],
		});
	});

	it("chains a script with no saved mode", () => {
		expect(planWorkspaceRunLaunch(preset)).toEqual({
			layout: "single",
			commands: ["bun run backend && bun run frontend"],
		});
	});

	it("keeps a single command in one terminal whatever the mode", () => {
		expect(
			planWorkspaceRunLaunch({
				...preset,
				commands: ["bun dev"],
				executionMode: "new-tab-split-pane",
			}),
		).toEqual({ layout: "single", commands: ["bun dev"] });
	});

	it("splits panes for split-pane modes", () => {
		for (const executionMode of ["split-pane", "new-tab-split-pane"] as const) {
			expect(planWorkspaceRunLaunch({ ...preset, executionMode })).toEqual({
				layout: "split-panes",
				commands: ["bun run backend", "bun run frontend"],
			});
		}
	});

	it("opens a tab per command for new-tab mode", () => {
		expect(
			planWorkspaceRunLaunch({ ...preset, executionMode: "new-tab" }),
		).toEqual({
			layout: "tabs",
			commands: ["bun run backend", "bun run frontend"],
		});
	});
});
