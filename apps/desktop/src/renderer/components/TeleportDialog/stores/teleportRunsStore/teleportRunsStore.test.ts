import { beforeEach, describe, expect, it } from "bun:test";
import { TELEPORT_STEPS } from "@superset/shared/teleport";
import type { TeleportDestination } from "../../types";
import { deriveRunOutcome } from "../../utils/runOutcome";
import { useTeleportRunsStore } from "./teleportRunsStore";

const cloud: TeleportDestination = {
	kind: "cloud",
	id: "cloud",
	name: "Cloud",
};

describe("teleportRunsStore", () => {
	beforeEach(() => {
		useTeleportRunsStore.setState({ runs: {} });
	});

	it("tracks a run from begin to done", () => {
		const store = useTeleportRunsStore.getState();
		store.begin("ws-1", cloud);
		for (const step of TELEPORT_STEPS) {
			store.progress("ws-1", { step, state: "done" });
		}
		const record = useTeleportRunsStore.getState().runs["ws-1"];
		expect(record?.destination).toEqual(cloud);
		expect(record && deriveRunOutcome(record.run)).toBe("done");
	});

	it("ignores progress for a workspace with no run", () => {
		useTeleportRunsStore
			.getState()
			.progress("ghost", { step: "capture", state: "running" });
		expect(useTeleportRunsStore.getState().runs).toEqual({});
	});

	it("remembers the cloud destination and whether anyone watches", () => {
		const store = useTeleportRunsStore.getState();
		store.begin("ws-1", cloud);
		store.setCloudDestination("ws-1", "cloud-row");
		store.setWatched("ws-1", false);
		const record = useTeleportRunsStore.getState().runs["ws-1"];
		expect(record?.cloudDestinationId).toBe("cloud-row");
		expect(record?.watched).toBe(false);
	});

	it("clears only the named run", () => {
		const store = useTeleportRunsStore.getState();
		store.begin("ws-1", cloud);
		store.begin("ws-2", cloud);
		store.clear("ws-1");
		expect(Object.keys(useTeleportRunsStore.getState().runs)).toEqual(["ws-2"]);
	});
});
