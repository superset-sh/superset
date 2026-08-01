import { describe, expect, test } from "bun:test";
import {
	getAgentsChipLabel,
	getStopAllAgentsConfirmCopy,
} from "./agentsChipCopy";

describe("getAgentsChipLabel", () => {
	test("describes the chip as opening the agent list", () => {
		expect(getAgentsChipLabel(1)).toBe("Show 1 running agent");
		expect(getAgentsChipLabel(3)).toBe("Show 3 running agents");
	});

	test("never advertises a destructive action", () => {
		for (const count of [1, 2, 7]) {
			const label = getAgentsChipLabel(count).toLowerCase();
			expect(label).not.toContain("stop");
			expect(label).not.toContain("kill");
		}
	});
});

describe("getStopAllAgentsConfirmCopy", () => {
	test("names how many sessions are about to be disposed", () => {
		expect(getStopAllAgentsConfirmCopy(3).title).toBe("Stop all 3 agents?");
		expect(getStopAllAgentsConfirmCopy(3).confirmLabel).toBe("Stop 3 agents");
	});

	test("stays singular for a lone agent", () => {
		expect(getStopAllAgentsConfirmCopy(1).title).toBe("Stop 1 agent?");
		expect(getStopAllAgentsConfirmCopy(1).confirmLabel).toBe("Stop 1 agent");
	});

	test("says the loss is unrecoverable", () => {
		expect(getStopAllAgentsConfirmCopy(2).description).toContain(
			"can't be recovered",
		);
	});
});
