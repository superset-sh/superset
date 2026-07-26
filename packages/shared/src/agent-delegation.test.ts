import { describe, expect, it } from "bun:test";
import { buildWorkspaceDelegationInstructions } from "./agent-delegation";
import { HOST_AGENT_PRESETS } from "./host-agent-presets";

describe("buildWorkspaceDelegationInstructions", () => {
	it("builds the local subworkspace command for every supported agent selector", () => {
		for (const { presetId } of HOST_AGENT_PRESETS) {
			const instructions = buildWorkspaceDelegationInstructions({
				workspaceId: "11111111-1111-4111-8111-111111111111",
				agent: presetId,
			});

			expect(instructions).toContain(
				'superset workspaces create-subworkspace --parent "11111111-1111-4111-8111-111111111111"',
			);
			expect(instructions).toContain(`--agent ${JSON.stringify(presetId)}`);
			expect(instructions).toContain("--delegation-mode workspaces");
			expect(instructions).toContain("requires no Superset MCP or cloud login");
			expect(instructions).toContain("do not use hidden/native subagent tools");
		}
	});
});
