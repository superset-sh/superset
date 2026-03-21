import { describe, expect, it } from "bun:test";
import type { EnrichedPort } from "shared/types";
import { getPortsToKillForPane } from "./getPortsToKillForPane";

describe("getPortsToKillForPane", () => {
	it("returns one representative port per pid for the target pane", () => {
		const ports: EnrichedPort[] = [
			{
				port: 3001,
				pid: 42,
				processName: "vite",
				paneId: "pane-1",
				workspaceId: "ws-1",
				detectedAt: 20,
				address: "127.0.0.1",
				label: null,
			},
			{
				port: 3000,
				pid: 42,
				processName: "vite",
				paneId: "pane-1",
				workspaceId: "ws-1",
				detectedAt: 10,
				address: "127.0.0.1",
				label: null,
			},
			{
				port: 8080,
				pid: 99,
				processName: "api",
				paneId: "pane-1",
				workspaceId: "ws-1",
				detectedAt: 15,
				address: "127.0.0.1",
				label: null,
			},
			{
				port: 4000,
				pid: 100,
				processName: "other",
				paneId: "pane-2",
				workspaceId: "ws-2",
				detectedAt: 30,
				address: "127.0.0.1",
				label: null,
			},
		];

		expect(getPortsToKillForPane(ports, "pane-1")).toEqual([
			{ paneId: "pane-1", port: 3001 },
			{ paneId: "pane-1", port: 8080 },
		]);
	});
});
