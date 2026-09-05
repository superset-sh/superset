import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, render, within } = await import("@testing-library/react");
const { SwitchHistory } = await import("./SwitchHistory");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const AGENT_LABELS = { claude: "Claude Code", codex: "Codex" } as const;

type Entry = Parameters<typeof SwitchHistory>[0]["entries"][number];

const older: Entry = {
	at: Date.UTC(2026, 8, 4, 10, 0),
	agent: "codex",
	fromAccountId: "b",
	fromLabel: "b@example.com",
	toAccountId: "c",
	toLabel: "c@example.com",
	reasonKind: "manual",
};

const newer: Entry = {
	at: Date.UTC(2026, 8, 5, 9, 3),
	agent: "claude",
	fromAccountId: "a",
	fromLabel: "a@example.com",
	toAccountId: "b",
	toLabel: "b@example.com",
	reasonKind: "threshold",
	windowId: "five_hour",
	usedPercent: 91,
	fallbackRestart: true,
};

function renderHistory(entries: Entry[]) {
	const view = render(
		<SwitchHistory
			entries={entries}
			isLoading={false}
			agentLabels={AGENT_LABELS}
		/>,
	);
	return within(view.baseElement as HTMLElement);
}

describe("SwitchHistory", () => {
	test("keeps the host's newest-first order and composes the reason itself", () => {
		const ui = renderHistory([newer, older]);
		const rows = ui.getAllByRole("row").slice(1);
		expect(rows[0]?.textContent).toContain("5-hour window at 91%");
		expect(rows[0]?.textContent).toContain("Claude Code");
		expect(rows[0]?.textContent).toContain("Automatic");
		expect(rows[0]?.textContent).toContain("Restarted and resumed");
		expect(rows[1]?.textContent).toContain("Codex");
		expect(rows[1]?.textContent).toContain("Manual");
		expect(rows[1]?.textContent).toContain("You picked this account");
	});

	test("says what the empty table would hold", () => {
		const ui = renderHistory([]);
		expect(ui.queryByRole("table")).toBeNull();
		expect(ui.getByText(/No account switches yet/)).toBeTruthy();
	});
});
