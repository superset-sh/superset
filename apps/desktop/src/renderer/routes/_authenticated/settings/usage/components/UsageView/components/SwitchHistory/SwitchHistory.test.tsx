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

function history(
	entries: Entry[],
	props: Partial<Parameters<typeof SwitchHistory>[0]> = {},
) {
	return (
		<SwitchHistory
			entries={entries}
			isLoading={false}
			isError={false}
			agentLabels={AGENT_LABELS}
			hideEmails={false}
			{...props}
		/>
	);
}

function renderHistory(
	entries: Entry[],
	props: Partial<Parameters<typeof SwitchHistory>[0]> = {},
) {
	const view = render(history(entries, props));
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

	// Two switches recorded in the same tick share every other field: a key
	// built from them alone collides and React drops or reorders a row.
	test("a refresh keeps every entry recorded in the same tick", () => {
		const tick = (id: string): Entry => ({
			...older,
			toAccountId: id,
			toLabel: `${id}@example.com`,
		});
		const view = render(history([tick("c"), tick("d")]));
		// A refresh prepends a switch from a later tick.
		view.rerender(history([newer, tick("c"), tick("d")]));
		const ui = within(view.baseElement as HTMLElement);
		const rows = ui.getAllByRole("row").slice(1);
		// The "To" column, in order: every entry is there, newest first.
		expect(
			rows.map((row) => within(row).getAllByRole("cell")[3]?.textContent),
		).toEqual(["b@example.com", "c@example.com", "d@example.com"]);
	});

	// A refetch that fails still leaves the rows we already read: replacing
	// them with an error hides history the user can still be shown.
	test("a failed refetch keeps the rows it already has", () => {
		const ui = renderHistory([newer, older], { isError: true });
		expect(ui.getAllByRole("row").slice(1)).toHaveLength(2);
		expect(ui.getByText(/Last read failed/)).toBeTruthy();
		expect(ui.queryByText(/History is unavailable right now/)).toBeNull();
	});

	test("hidden emails are hidden in the table too", () => {
		const ui = renderHistory([newer], { hideEmails: true });
		const row = ui.getAllByRole("row")[1];
		expect(row?.textContent).not.toContain("a@example.com");
		expect(row?.textContent).not.toContain("b@example.com");
		expect(ui.getAllByText("Email hidden")).toHaveLength(2);
		const cells = within(row as HTMLElement).getAllByRole("cell");
		expect(cells[2]?.className).toContain("blur");
		expect(cells[3]?.className).toContain("blur");
		// The rest of the row still reads.
		expect(row?.textContent).toContain("Claude Code");
	});

	// Config-dir accounts have no email to hide: masking them makes two
	// distinct accounts read as the same "Email hidden".
	test("hiding emails leaves path labels readable and distinct", () => {
		const ui = renderHistory(
			[
				{
					...older,
					fromLabel: "~/.codex-work",
					toLabel: "~/.codex-personal",
				},
			],
			{ hideEmails: true },
		);
		const row = ui.getAllByRole("row")[1];
		expect(row?.textContent).toContain("~/.codex-work");
		expect(row?.textContent).toContain("~/.codex-personal");
		expect(ui.queryByText("Email hidden")).toBeNull();
		// Nothing to hide, so nothing is blurred either.
		const cells = within(row as HTMLElement).getAllByRole("cell");
		expect(cells[2]?.className).not.toContain("blur");
		expect(cells[3]?.className).not.toContain("blur");
	});
});
