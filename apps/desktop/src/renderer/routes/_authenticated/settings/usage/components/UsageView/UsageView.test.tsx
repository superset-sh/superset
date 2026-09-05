import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document. Process-wide, so this
// unregisters in afterAll to leave the other renderer suites their document.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { AccountCard } = await import("./UsageView");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

type Account = Parameters<typeof AccountCard>[0]["account"];

function account(overrides: Partial<Account> = {}): Account {
	return {
		agent: "claude",
		credentialKind: "subscription",
		accountKey: "claude:/p/a",
		sourceLabel: "~/.claude",
		email: "a@example.com",
		plan: "max",
		status: "ok",
		statusDetail: null,
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		selection: "/p/a",
		accountId: "uuid-a",
		inRotation: true,
		managed: true,
		isDefault: false,
		fetchedAt: new Date(0),
		...overrides,
	} as Account;
}

function renderCard(
	value: Account,
	props: Partial<Parameters<typeof AccountCard>[0]> = {},
) {
	return render(
		<AccountCard
			account={value}
			onMakeActive={() => {}}
			onToggleRotation={() => {}}
			onSwitchSignIn={null}
			onRemove={null}
			isActivating={false}
			isSwitching={false}
			error={null}
			selectable
			hideEmails={false}
			{...props}
		/>,
	);
}

describe("AccountCard active indicator", () => {
	test("only the active account says Active; the rest offer the switch", () => {
		const view = render(
			<>
				<AccountCard
					account={account({ isDefault: true, email: "active@example.com" })}
					onMakeActive={null}
					onToggleRotation={() => {}}
					onSwitchSignIn={null}
					onRemove={null}
					isActivating={false}
					isSwitching={false}
					error={null}
					selectable
					hideEmails={false}
				/>
				<AccountCard
					account={account({
						accountKey: "claude:/p/b",
						accountId: "uuid-b",
						email: "spare@example.com",
					})}
					onMakeActive={() => {}}
					onToggleRotation={() => {}}
					onSwitchSignIn={null}
					onRemove={null}
					isActivating={false}
					isSwitching={false}
					error={null}
					selectable
					hideEmails={false}
				/>
			</>,
		);
		const ui = within(view.baseElement as HTMLElement);
		expect(ui.getAllByText("Active")).toHaveLength(1);
		expect(ui.getAllByText("Make active")).toHaveLength(1);
		// The old wording promised something the engine no longer does.
		expect(view.baseElement.textContent).not.toContain(
			"Default for new agents",
		);
	});

	test("a switch in flight says so on the card that asked", () => {
		const view = renderCard(account(), { isActivating: true });
		expect(
			within(view.baseElement as HTMLElement).getByText("Switching…"),
		).toBeTruthy();
	});

	test("a refused switch explains itself and leaves the indicator alone", () => {
		const view = renderCard(account(), {
			error:
				"Switch failed (swap-verify-failed). The previous account is still active.",
		});
		const ui = within(view.baseElement as HTMLElement);
		expect(ui.getByRole("alert").textContent).toContain("swap-verify-failed");
		expect(ui.queryByText("Active")).toBeNull();
		expect(ui.getByText("Make active")).toBeTruthy();
	});
});

describe("AccountCard rotation", () => {
	test("the toggle reports the value the user asked for", () => {
		const calls: boolean[] = [];
		const view = renderCard(account({ inRotation: true }), {
			onToggleRotation: (next: boolean) => calls.push(next),
		});
		const toggle = within(view.baseElement as HTMLElement).getByRole("switch");
		expect(toggle.getAttribute("aria-checked")).toBe("true");
		fireEvent.click(toggle);
		expect(calls).toEqual([false]);
	});

	test("agents the engine cannot switch get no toggle at all", () => {
		const view = renderCard(account(), { onToggleRotation: null });
		expect(
			within(view.baseElement as HTMLElement).queryByRole("switch"),
		).toBeNull();
	});
});

describe("AccountCard account state", () => {
	test("a stale token reads as eligible, not as a sign-in problem", () => {
		const view = renderCard(account({ status: "token_stale" }));
		const text = view.baseElement.textContent ?? "";
		expect(text).toContain("Stale token, still eligible");
		expect(text).not.toContain("Sign-in expired");
		expect(text).not.toContain("Signed out");
	});

	test("an unmanaged login says Superset will not touch it", () => {
		const view = renderCard(account({ managed: false }));
		const text = view.baseElement.textContent ?? "";
		expect(text).toContain("Unmanaged");
		expect(text).toContain("switching leaves this login alone");
	});

	// #11: the card promises switching never writes to this login, so it must
	// not offer a control that would — not the button, not the rotation
	// toggle, and not the selectable circle that would sit there doing nothing.
	test("an unmanaged login offers no way to switch onto it", () => {
		const view = renderCard(account({ managed: false }));
		const ui = within(view.baseElement as HTMLElement);
		expect(ui.queryByText("Make active")).toBeNull();
		expect(ui.queryByRole("switch")).toBeNull();
		expect(
			ui.queryByTitle(
				"Make active — running sessions move to this account too.",
			),
		).toBeNull();
	});
});
