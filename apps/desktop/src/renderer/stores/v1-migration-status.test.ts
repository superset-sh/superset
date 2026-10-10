import { describe, expect, test } from "bun:test";
import { useV1MigrationStatusStore } from "./v1-migration-status";

describe("v1 migration status", () => {
	test("losing the host-service clears a progress card that can't finish", () => {
		const store = useV1MigrationStatusStore.getState();
		store.setStatus("org", "running");
		store.clearRunning("org");
		expect(useV1MigrationStatusStore.getState().status).toBe("idle");
	});

	test("keeps blocked and attention results, and other orgs' status", () => {
		const store = useV1MigrationStatusStore.getState();
		store.setStatus("org", "blocked");
		store.clearRunning("org");
		expect(useV1MigrationStatusStore.getState().status).toBe("blocked");
		store.setStatus("other", "running");
		store.clearRunning("org");
		expect(useV1MigrationStatusStore.getState().status).toBe("running");
	});
});
