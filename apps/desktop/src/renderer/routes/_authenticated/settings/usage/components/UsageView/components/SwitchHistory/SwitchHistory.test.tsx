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

function renderHistory(
	entries: Entry[],
	props: Partial<Parameters<typeof SwitchHistory>[0]> = {},
) {
	const view = render(
		<SwitchHistory
			entries={entries}
			isLoading={false}
			isError={false}
			agentLabels={AGENT_LABELS}
			hideEmails={false}
			{...props}
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

	// A failed read is not an empty history: claiming nothing ever happened
	// would be a lie the user cannot tell from the truth.
	test("a failed read says so instead of claiming nothing happened", () => {
		const ui = renderHistory([], { isError: true });
		expect(ui.queryByRole("table")).toBeNull();
		expect(ui.queryByText(/No account switches yet/)).toBeNull();
		expect(ui.getByText(/History is unavailable right now/)).toBeTruthy();
	});

	test("hidden emails are hidden in the table too", () => {
		const ui = renderHistory([newer], { hideEmails: true });
		const row = ui.getAllByRole("row")[1];
		expect(row?.textContent).not.toContain("a@example.com");
		expect(row?.textContent).not.toContain("b@example.com");
		expect(ui.getAllByText("Email hidden")).toHaveLength(2);
		// The rest of the row still reads.
		expect(row?.textContent).toContain("Claude Code");
	});
});
