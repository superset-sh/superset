import { describe, expect, test } from "bun:test";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import {
	findAutomationAgentChoice,
	getAutomationAgentDisplay,
	getPortableAutomationAgentId,
} from "./agentDisplay";

const agents: AgentSelectAgent[] = [
	{
		id: "d745e560-44a1-4115-9c29-d8ef7b336590",
		label: "Claude",
		iconId: "claude",
	},
	{
		id: "custom-agent",
		label: "Internal Runner",
	},
];

describe("automation agent display", () => {
	test("stores portable preset ids for preset-backed host agents", () => {
		expect(getPortableAutomationAgentId(agents[0])).toBe("claude");
		expect(getPortableAutomationAgentId(agents[1])).toBe("custom-agent");
	});

	test("matches both host instance ids and portable preset ids", () => {
		expect(
			findAutomationAgentChoice(agents, "d745e560-44a1-4115-9c29-d8ef7b336590")
				?.label,
		).toBe("Claude");
		expect(findAutomationAgentChoice(agents, "claude")?.label).toBe("Claude");
	});

	test("does not expose raw uuid-shaped agent ids when a host match is unavailable", () => {
		expect(
			getAutomationAgentDisplay([], "d745e560-44a1-4115-9c29-d8ef7b336590"),
		).toEqual({
			label: "Configured runner",
			iconKey: null,
			isKnown: false,
		});
	});

	test("falls back to known preset labels", () => {
		expect(getAutomationAgentDisplay([], "claude").label).toBe("Claude");
	});
});
