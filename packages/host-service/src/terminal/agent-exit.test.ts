import { describe, expect, it } from "bun:test";
import { isAbnormalAgentExit } from "./agent-exit";

describe("isAbnormalAgentExit", () => {
	it("treats a clean exit (code 0, no signal) as normal", () => {
		expect(isAbnormalAgentExit(0, 0)).toBe(false);
	});

	it("treats a non-zero exit code as abnormal", () => {
		expect(isAbnormalAgentExit(1, 0)).toBe(true);
		expect(isAbnormalAgentExit(127, 0)).toBe(true);
	});

	it("treats user-interrupt exit codes (130 SIGINT, 143 SIGTERM) as normal", () => {
		expect(isAbnormalAgentExit(130, 0)).toBe(false);
		expect(isAbnormalAgentExit(143, 0)).toBe(false);
	});

	it("treats user/host stop signals as normal", () => {
		expect(isAbnormalAgentExit(0, 1)).toBe(false); // SIGHUP (our dispose)
		expect(isAbnormalAgentExit(0, 2)).toBe(false); // SIGINT
		expect(isAbnormalAgentExit(0, 9)).toBe(false); // SIGKILL
		expect(isAbnormalAgentExit(0, 15)).toBe(false); // SIGTERM
	});

	it("treats crash signals as abnormal", () => {
		expect(isAbnormalAgentExit(0, 6)).toBe(true); // SIGABRT
		expect(isAbnormalAgentExit(0, 11)).toBe(true); // SIGSEGV
	});
});
