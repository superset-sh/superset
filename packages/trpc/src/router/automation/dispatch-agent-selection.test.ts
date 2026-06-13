import { describe, expect, test } from "bun:test";
import { chooseAutomationAgentForHost } from "./dispatch-agent-selection";

describe("chooseAutomationAgentForHost", () => {
	test("keeps a target-host config instance id when it exists on the target host", () => {
		const selected = chooseAutomationAgentForHost({
			agent: "target-claude-instance",
			selectedHostMachineId: "target-host",
			sourceHostId: "source-host",
			targetConfigs: [{ id: "target-claude-instance", presetId: "claude" }],
			sourceConfigs: [{ id: "source-claude-instance", presetId: "claude" }],
		});

		expect(selected).toBe("target-claude-instance");
	});

	test("keeps portable preset ids as-is", () => {
		const selected = chooseAutomationAgentForHost({
			agent: "claude",
			selectedHostMachineId: "target-host",
			sourceHostId: "source-host",
			targetConfigs: [{ id: "target-claude-instance", presetId: "claude" }],
			sourceConfigs: [],
		});

		expect(selected).toBe("claude");
	});

	test("maps a source-host instance id to its portable preset id after host reroute", () => {
		const selected = chooseAutomationAgentForHost({
			agent: "source-claude-instance",
			selectedHostMachineId: "target-host",
			sourceHostId: "source-host",
			targetConfigs: [{ id: "target-claude-instance", presetId: "claude" }],
			sourceConfigs: [{ id: "source-claude-instance", presetId: "claude" }],
		});

		expect(selected).toBe("claude");
	});

	test("keeps the original id when no source mapping is known", () => {
		const selected = chooseAutomationAgentForHost({
			agent: "source-custom-instance",
			selectedHostMachineId: "target-host",
			sourceHostId: "source-host",
			targetConfigs: [{ id: "target-claude-instance", presetId: "claude" }],
			sourceConfigs: [],
		});

		expect(selected).toBe("source-custom-instance");
	});
});
