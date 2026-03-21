import { describe, expect, it, mock } from "bun:test";
import type { EnrichedPort } from "shared/types";
import { killPaneProcess } from "./killPaneProcess";

describe("killPaneProcess", () => {
	it("uses the hard-kill fallback when the pane stays alive", async () => {
		const getPorts = mock<() => Promise<EnrichedPort[]>>(() =>
			Promise.resolve([]),
		);
		const killPorts = mock(() =>
			Promise.resolve({
				results: [],
				failedCount: 0,
			}),
		);
		const writeToTerminal = mock(() => Promise.resolve(undefined));
		const getSession = mock<() => Promise<{ isAlive: boolean } | null>>()
			.mockResolvedValueOnce({ isAlive: true })
			.mockResolvedValueOnce({ isAlive: true })
			.mockResolvedValueOnce({ isAlive: true })
			.mockResolvedValueOnce({ isAlive: true })
			.mockResolvedValueOnce({ isAlive: true })
			.mockResolvedValueOnce({ isAlive: false });
		const killPane = mock(() => Promise.resolve(undefined));
		const sleep = mock(() => Promise.resolve());

		await killPaneProcess({
			paneId: "pane-1",
			getPorts,
			killPorts,
			writeToTerminal,
			getSession,
			killPane,
			sleep,
		});

		expect(writeToTerminal).toHaveBeenCalledWith({
			paneId: "pane-1",
			data: "\u0003",
			throwOnError: true,
		});
		expect(killPane).toHaveBeenCalledWith({ paneId: "pane-1" });
	});

	it("treats an already-gone pane as a successful stop", async () => {
		const getPorts = mock<() => Promise<EnrichedPort[]>>(() =>
			Promise.resolve([]),
		);
		const killPorts = mock(() =>
			Promise.resolve({
				results: [],
				failedCount: 0,
			}),
		);
		const writeToTerminal = mock(() =>
			Promise.reject(
				new Error("Terminal session pane-1 not found or not alive"),
			),
		);
		const getSession = mock<() => Promise<{ isAlive: boolean } | null>>(() =>
			Promise.resolve(null),
		);
		const killPane = mock(() => Promise.resolve(undefined));

		await killPaneProcess({
			paneId: "pane-1",
			getPorts,
			killPorts,
			writeToTerminal,
			getSession,
			killPane,
		});

		expect(killPane).not.toHaveBeenCalled();
	});

	it("stops tracked pane ports before checking for a hard kill fallback", async () => {
		const getPorts = mock<() => Promise<EnrichedPort[]>>(() =>
			Promise.resolve([
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
			]),
		);
		const killPorts = mock(() =>
			Promise.resolve({
				results: [{ success: true }],
				failedCount: 0,
			}),
		);
		const writeToTerminal = mock(() =>
			Promise.reject(
				new Error("Terminal session pane-1 not found or not alive"),
			),
		);
		const getSession = mock<() => Promise<{ isAlive: boolean } | null>>(() =>
			Promise.resolve(null),
		);
		const killPane = mock(() => Promise.resolve(undefined));

		await killPaneProcess({
			paneId: "pane-1",
			getPorts,
			killPorts,
			writeToTerminal,
			getSession,
			killPane,
		});

		expect(killPorts).toHaveBeenCalledWith([{ paneId: "pane-1", port: 3000 }]);
		expect(killPane).not.toHaveBeenCalled();
	});

	it("falls back to a hard kill when session inspection fails after ctrl+c", async () => {
		const getPorts = mock<() => Promise<EnrichedPort[]>>(() =>
			Promise.resolve([]),
		);
		const killPorts = mock(() =>
			Promise.resolve({
				results: [],
				failedCount: 0,
			}),
		);
		const writeToTerminal = mock(() => Promise.resolve(undefined));
		const getSession = mock<() => Promise<{ isAlive: boolean } | null>>()
			.mockRejectedValueOnce(new Error("transport down"))
			.mockResolvedValueOnce({ isAlive: false });
		const killPane = mock(() => Promise.resolve(undefined));

		await killPaneProcess({
			paneId: "pane-1",
			getPorts,
			killPorts,
			writeToTerminal,
			getSession,
			killPane,
		});

		expect(killPane).toHaveBeenCalledWith({ paneId: "pane-1" });
	});

	it("rethrows unexpected session inspection errors when stop cannot be verified", async () => {
		const getPorts = mock<() => Promise<EnrichedPort[]>>(() =>
			Promise.resolve([]),
		);
		const killPorts = mock(() =>
			Promise.resolve({
				results: [],
				failedCount: 0,
			}),
		);
		const writeToTerminal = mock(() => Promise.resolve(undefined));
		const getSession = mock<() => Promise<{ isAlive: boolean } | null>>()
			.mockRejectedValueOnce(new Error("transport down"))
			.mockRejectedValueOnce(new Error("transport down"));
		const killPane = mock(() => Promise.resolve(undefined));

		await expect(
			killPaneProcess({
				paneId: "pane-1",
				getPorts,
				killPorts,
				writeToTerminal,
				getSession,
				killPane,
			}),
		).rejects.toThrow("transport down");

		expect(killPane).toHaveBeenCalledWith({ paneId: "pane-1" });
	});
});
