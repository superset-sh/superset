import { describe, expect, it } from "bun:test";
import { selectWorkspaceRunDefinition } from "./workspace-run-definition";

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
});
