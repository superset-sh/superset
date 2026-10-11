import { describe, expect, test } from "bun:test";
import {
	isStatusCardVisible,
	useV1MigrationStatusStore,
} from "./v1-migration-status";

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

describe("status card visibility", () => {
	const base = {
		organizationId: "org-a",
		status: "blocked" as const,
		attentionItems: [],
		dismissed: null,
	};

	test("a dismissal in one org does not hide another org's card", () => {
		const dismissedInB = {
			...base,
			dismissed: {
				organizationId: "org-b",
				status: "blocked" as const,
				signature: "",
			},
		};
		expect(isStatusCardVisible(dismissedInB, "org-a")).toBe(true);
	});

	test("a changed attention list shows again after a dismissal", () => {
		const item = {
			kind: "worktree" as const,
			v1Id: "w2",
			name: "w2",
			path: "/w2",
		};
		const state = {
			...base,
			status: "attention" as const,
			attentionItems: [item],
			dismissed: {
				organizationId: "org-a",
				status: "attention" as const,
				signature: "worktree:w1",
			},
		};
		expect(isStatusCardVisible(state, "org-a")).toBe(true);
		expect(
			isStatusCardVisible(
				{
					...state,
					dismissed: { ...state.dismissed, signature: "worktree:w2" },
				},
				"org-a",
			),
		).toBe(false);
	});
});
