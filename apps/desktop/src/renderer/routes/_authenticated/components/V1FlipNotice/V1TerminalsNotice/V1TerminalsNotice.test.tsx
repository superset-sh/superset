import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useV1MigrationStatusStore } from "renderer/stores/v1-migration-status";
import { V1TerminalsNotice } from "./V1TerminalsNotice";

type Source = NonNullable<Parameters<typeof V1TerminalsNotice>[0]["source"]>;

let activeOrganizationId = "org-a";

let organizationCounter = 0;
beforeEach(() => {
	organizationCounter += 1;
	activeOrganizationId = `org-${organizationCounter}`;
	localStorage.clear();
	useV1MigrationStatusStore.setState({
		organizationId: null,
		status: "idle",
		attentionItems: [],
		dismissed: null,
	});
});
afterEach(cleanup);

function source({
	paneIds = ["pane-1"],
	sessions = {},
}: {
	paneIds?: string[];
	sessions?: Awaited<ReturnType<Source["readAgentSessions"]>>;
} = {}): Source {
	return {
		listMigratedPaneIds: async () => paneIds,
		readAgentSessions: async () => sessions,
	};
}

async function renderNotice(input: Source) {
	const view = render(
		<V1TerminalsNotice organizationId={activeOrganizationId} source={input} />,
	);
	await act(async () => {});
	return view;
}

function settlePass(status: "idle" | "running" = "idle") {
	act(() => {
		useV1MigrationStatusStore
			.getState()
			.setStatus(activeOrganizationId, status);
	});
}

describe("V1TerminalsNotice", () => {
	test("waits for the first pass, then shows the generic resume hint", async () => {
		const view = await renderNotice(source());
		expect(view.container.innerHTML).toBe("");

		settlePass("running");
		await act(async () => {});
		expect(view.container.innerHTML).toBe("");

		settlePass("idle");
		await act(async () => {});
		expect(view.container.textContent).toContain("Your terminals restarted");
		expect(view.container.textContent).toContain("claude --resume");
		expect(view.container.textContent).not.toContain("Superset resumes");
	});

	test("names the agents whose recorded sessions resume", async () => {
		const view = await renderNotice(
			source({
				sessions: {
					"pane-1": {
						agentId: "claude",
						agentSessionId: "s-1",
						prompted: true,
					},
					"pane-2": {
						agentId: "codex",
						agentSessionId: "s-2",
						prompted: true,
						endedAt: 1,
					},
				},
			}),
		);
		settlePass();
		await act(async () => {});
		const text = view.container.textContent ?? "";
		expect(text).toContain("Superset resumes the agent sessions it recorded");
		expect(text).toContain("Claude");
		expect(text).not.toContain("Codex");
	});

	test("stays hidden without migrated terminals", async () => {
		const view = await renderNotice(source({ paneIds: [] }));
		settlePass();
		await act(async () => {});
		expect(view.container.innerHTML).toBe("");
		expect(
			localStorage.getItem(`v1-terminals-notice-${activeOrganizationId}`),
		).toBeNull();
	});

	test("yields this launch to the welcome card and shows on the next", async () => {
		localStorage.setItem(
			`v1-migration-welcome-pending-${activeOrganizationId}`,
			"1",
		);
		localStorage.setItem(`v1-migration-complete-${activeOrganizationId}`, "x");
		const view = await renderNotice(source());
		expect(view.container.innerHTML).toBe("");
		expect(
			localStorage.getItem(`v1-terminals-notice-${activeOrganizationId}`),
		).toBe("pending");
	});

	test("never shows for an org already on v2", async () => {
		localStorage.setItem(`v1-migration-complete-${activeOrganizationId}`, "x");
		const view = await renderNotice(source());
		expect(view.container.innerHTML).toBe("");
	});

	test("dismissal persists per org", async () => {
		const view = await renderNotice(source());
		settlePass();
		await act(async () => {});
		const button = view.getByText("Got it");
		act(() => {
			fireEvent.click(button);
		});
		expect(view.container.innerHTML).toBe("");
		expect(
			localStorage.getItem(`v1-terminals-notice-${activeOrganizationId}`),
		).toBe("dismissed");

		cleanup();
		const again = await renderNotice(source());
		expect(again.container.innerHTML).toBe("");
	});
});
