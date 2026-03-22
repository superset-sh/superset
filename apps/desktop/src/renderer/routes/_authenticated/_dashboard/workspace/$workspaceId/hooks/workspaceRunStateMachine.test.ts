import { describe, expect, it } from "bun:test";
import { getWorkspaceRunUiState } from "./workspaceRunStateMachine";

describe("getWorkspaceRunUiState", () => {
	it("returns setup when there is no run command and nothing is running", () => {
		expect(
			getWorkspaceRunUiState({
				hasRunCommand: false,
				isRunning: false,
				isStopRequested: false,
				transition: null,
			}),
		).toBe("setup");
	});

	it("returns idle when a run command exists and nothing is running", () => {
		expect(
			getWorkspaceRunUiState({
				hasRunCommand: true,
				isRunning: false,
				isStopRequested: false,
				transition: null,
			}),
		).toBe("idle");
	});

	it("returns starting while a start transition is active", () => {
		expect(
			getWorkspaceRunUiState({
				hasRunCommand: true,
				isRunning: false,
				isStopRequested: false,
				transition: "starting",
			}),
		).toBe("starting");
	});

	it("returns stopping while a stop transition is active", () => {
		expect(
			getWorkspaceRunUiState({
				hasRunCommand: true,
				isRunning: true,
				isStopRequested: false,
				transition: "stopping",
			}),
		).toBe("stopping");
	});

	it("returns stopping while a stop has been requested and the process is still running", () => {
		expect(
			getWorkspaceRunUiState({
				hasRunCommand: true,
				isRunning: true,
				isStopRequested: true,
				transition: null,
			}),
		).toBe("stopping");
	});

	it("returns running when a run is active without a transition", () => {
		expect(
			getWorkspaceRunUiState({
				hasRunCommand: true,
				isRunning: true,
				isStopRequested: false,
				transition: null,
			}),
		).toBe("running");
	});
});
