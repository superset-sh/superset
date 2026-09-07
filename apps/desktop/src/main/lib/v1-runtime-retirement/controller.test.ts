import { describe, expect, test } from "bun:test";
import type { ListSessionsResponse } from "../terminal-host/types";
import { V1RuntimeRetirementController } from "./controller";
import { retireV1Runtime } from "./retire";

const migrated = {
	organizationId: "org",
	migratedAtBoot: true,
	v2Enabled: true,
};

function fixture() {
	let windows: Array<{ id: number; organizationId: string | null }> = [
		{ id: 1, organizationId: "org" },
	];
	let inventory: ListSessionsResponse | null = { sessions: [] };
	let migratedWorkspaces = new Set(["workspace"]);
	let shutdowns = 0;
	let cleanups = 0;
	let probes = 0;
	let probeError = false;
	let shutdownError = false;
	let afterProbe = () => {};
	const controller = new V1RuntimeRetirementController(
		() => windows,
		(eligible) =>
			retireV1Runtime(
				{
					listSessions: async () => {
						probes++;
						if (probeError) throw new Error("daemon unreachable");
						afterProbe();
						return inventory;
					},
					isWorkspaceMigrated: (id) => migratedWorkspaces.has(id),
					shutdown: async () => {
						if (shutdownError) throw new Error("shutdown failed");
						shutdowns++;
					},
					cleanup: async () => {
						cleanups++;
					},
				},
				eligible,
			),
	);
	return {
		controller,
		setWindows: (value: typeof windows) => {
			windows = value;
		},
		setInventory: (value: typeof inventory) => {
			inventory = value;
		},
		setMigrated: (value: string[]) => {
			migratedWorkspaces = new Set(value);
		},
		setProbeError: (value: boolean) => {
			probeError = value;
		},
		setShutdownError: (value: boolean) => {
			shutdownError = value;
		},
		afterProbe: (value: () => void) => {
			afterProbe = value;
		},
		counts: () => ({ probes, shutdowns, cleanups }),
	};
}

function session(
	overrides: Partial<ListSessionsResponse["sessions"][number]> = {},
) {
	return {
		sessionId: "session",
		paneId: "pane",
		workspaceId: "workspace",
		isAlive: true,
		attachedClients: 0,
		pid: 123,
		...overrides,
	};
}

describe("v1 runtime retirement", () => {
	test.each([
		["v1", { ...migrated, migratedAtBoot: false, v2Enabled: false }],
		["reversible v2 opt-in", { ...migrated, migratedAtBoot: false }],
		[
			"forced v2 without completed migration",
			{ ...migrated, migratedAtBoot: false },
		],
		["completion during live v1 session", { ...migrated, v2Enabled: false }],
	])("preserves %s without probing or killing", async (_name, report) => {
		const f = fixture();
		expect(await f.controller.report(1, report)).toBe(false);
		expect(f.counts()).toEqual({ probes: 0, shutdowns: 0, cleanups: 0 });
	});

	test("kills detached migrated jobs and retires once across duplicate reports", async () => {
		const f = fixture();
		f.setInventory({ sessions: [session()] });
		expect(
			await Promise.all([
				f.controller.report(1, migrated),
				f.controller.report(1, migrated),
			]),
		).toEqual([true, true]);
		expect(await f.controller.report(1, migrated)).toBe(true);
		expect(f.counts()).toEqual({ probes: 1, shutdowns: 1, cleanups: 1 });
	});

	test("does not spawn a missing daemon; still clears local resources", async () => {
		const f = fixture();
		f.setInventory(null);
		expect(await f.controller.report(1, migrated)).toBe(true);
		expect(f.counts()).toEqual({ probes: 1, shutdowns: 0, cleanups: 1 });
	});

	test("unknown window vetoes until both report a completed locked migration", async () => {
		const f = fixture();
		f.setWindows([
			{ id: 1, organizationId: "org" },
			{ id: 2, organizationId: "org" },
		]);
		expect(await f.controller.report(1, migrated)).toBe(false);
		expect(f.counts().probes).toBe(0);
		expect(
			await f.controller.report(2, { ...migrated, migratedAtBoot: false }),
		).toBe(false);
		expect(await f.controller.report(2, migrated)).toBe(true);
	});

	test("rejects an unregistered sender and a report from the previous organization", async () => {
		const f = fixture();
		expect(await f.controller.report(99, migrated)).toBe(false);
		expect(
			await f.controller.report(1, { ...migrated, organizationId: "other" }),
		).toBe(false);
		expect(f.counts().probes).toBe(0);
	});

	test("organization switch and renderer reload invalidate eligibility", async () => {
		const f = fixture();
		expect(await f.controller.report(1, migrated)).toBe(true);
		f.setWindows([{ id: 1, organizationId: "other" }]);
		expect(f.controller.isEligible()).toBe(false);
		expect(
			await f.controller.report(1, {
				...migrated,
				organizationId: "other",
				migratedAtBoot: false,
			}),
		).toBe(false);
		f.controller.forget(1);
		expect(f.controller.isEligible()).toBe(false);
	});

	test("a new locked window after retirement triggers a fresh cleanup", async () => {
		const f = fixture();
		expect(await f.controller.report(1, migrated)).toBe(true);
		f.setWindows([
			{ id: 1, organizationId: "org" },
			{ id: 2, organizationId: "org" },
		]);
		expect(await f.controller.report(2, migrated)).toBe(true);
		expect(f.counts().shutdowns).toBe(2);
		f.controller.forget(2);
		expect(await f.controller.report(2, migrated)).toBe(true);
		expect(f.counts().shutdowns).toBe(3);
	});

	test("a v1 window opening during the async probe cancels retirement", async () => {
		const f = fixture();
		f.afterProbe(() =>
			f.setWindows([
				{ id: 1, organizationId: "org" },
				{ id: 2, organizationId: "other" },
			]),
		);
		expect(await f.controller.report(1, migrated)).toBe(false);
		expect(f.counts()).toEqual({ probes: 1, shutdowns: 0, cleanups: 0 });
	});

	test("closing the vetoing window allows the next report to retire", async () => {
		const f = fixture();
		f.setWindows([
			{ id: 1, organizationId: "org" },
			{ id: 2, organizationId: "org" },
		]);
		expect(await f.controller.report(1, migrated)).toBe(false);
		f.setWindows([{ id: 1, organizationId: "org" }]);
		expect(await f.controller.report(1, migrated)).toBe(true);
	});

	test("no live windows is not permission to retire", () => {
		const f = fixture();
		f.setWindows([]);
		expect(f.controller.isEligible()).toBe(false);
	});

	test("live sessions without successful migration are preserved", async () => {
		const f = fixture();
		f.setInventory({
			sessions: [session(), session({ workspaceId: "unmigrated" })],
		});
		expect(await f.controller.report(1, migrated)).toBe(false);
		expect(f.counts().shutdowns).toBe(0);
		f.setMigrated(["workspace", "unmigrated"]);
		expect(await f.controller.report(1, migrated)).toBe(true);
	});

	test("an attached v1 session vetoes cleanup, including from another app instance", async () => {
		const f = fixture();
		f.setInventory({ sessions: [session({ attachedClients: 1 })] });
		expect(await f.controller.report(1, migrated)).toBe(false);
		expect(f.counts().shutdowns).toBe(0);
		f.setInventory({ sessions: [session()] });
		expect(await f.controller.report(1, migrated)).toBe(true);
	});

	test("failed inventory is not absence; retry succeeds", async () => {
		const f = fixture();
		f.setProbeError(true);
		await expect(f.controller.report(1, migrated)).rejects.toThrow(
			"daemon unreachable",
		);
		expect(f.counts().shutdowns).toBe(0);
		f.setProbeError(false);
		expect(await f.controller.report(1, migrated)).toBe(true);
	});

	test("failed shutdown does not mark resources retired", async () => {
		const f = fixture();
		f.setShutdownError(true);
		await expect(f.controller.report(1, migrated)).rejects.toThrow(
			"shutdown failed",
		);
		expect(f.counts().cleanups).toBe(0);
		f.setShutdownError(false);
		expect(await f.controller.report(1, migrated)).toBe(true);
	});
});
