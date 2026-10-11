import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { V1AttentionItem } from "renderer/lib/v1-migration/attention";
import {
	useV1MigrationStatusStore,
	type V1MigrationStatus,
} from "renderer/stores/v1-migration-status";
import { V1MigrationStatusCard } from "./V1MigrationStatusCard";

beforeEach(() => {
	localStorage.clear();
	useV1MigrationStatusStore.setState({
		organizationId: null,
		status: "idle",
		attentionItems: [],
		dismissed: null,
	});
});
afterEach(cleanup);

function renderWith(
	organizationId: string,
	status: V1MigrationStatus,
	attentionItems: V1AttentionItem[] = [],
) {
	useV1MigrationStatusStore
		.getState()
		.setStatus(organizationId, status, attentionItems);
	return render(<V1MigrationStatusCard organizationId="org-active" />);
}

function worktree(id: string): V1AttentionItem {
	return { kind: "worktree", v1Id: id, name: id, path: `/repos/${id}` };
}

describe("V1MigrationStatusCard", () => {
	test("shows progress while the first migration runs", () => {
		expect(renderWith("org-active", "running").container.textContent).toContain(
			"Bringing over your v1 projects",
		);
	});

	test("points a blocked migration at the importer", () => {
		expect(renderWith("org-active", "blocked").container.textContent).toContain(
			"Open importer",
		);
	});

	test("renders nothing when idle or for another org", () => {
		expect(renderWith("org-active", "idle").container.innerHTML).toBe("");
		cleanup();
		expect(renderWith("org-other", "blocked").container.innerHTML).toBe("");
	});

	test("lists every folder that needs attention", () => {
		const items = Array.from({ length: 7 }, (_, i) => worktree(`wt-${i}`));
		const text = renderWith("org-active", "attention", items).container
			.textContent;
		for (const item of items) expect(text).toContain(item.path);
	});

	test("a dismissed card shows again when the attention list changes", () => {
		const view = renderWith("org-active", "attention", [worktree("wt-1")]);
		act(() => {
			fireEvent.click(view.getByText("Got it"));
		});
		expect(view.container.innerHTML).toBe("");

		act(() => {
			useV1MigrationStatusStore
				.getState()
				.setStatus("org-active", "attention", [
					worktree("wt-1"),
					worktree("wt-2"),
				]);
		});
		expect(view.container.textContent).toContain("/repos/wt-2");
	});
});
