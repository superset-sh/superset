import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document. Process-wide, so this
// unregisters in afterAll to leave the other renderer suites their document.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render, within } = await import("@testing-library/react");
const { DropdownMenu, DropdownMenuContent } = await import(
	"@superset/ui/dropdown-menu"
);
const { TriggerMenuItems } = await import("./TriggerMenuItems");
const { TRIGGER_PROVIDERS } = await import("../../providers");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

/**
 * The Add Trigger menu, for a plan that cannot add everything:
 *
 *   ⏰ Scheduled            ▸
 *   ⌥ GitHub               ▸
 *   ⌗ Slack                ▸
 *   ⧉ Microsoft Teams  [Enterprise]   ← disabled, badged with the tier
 *
 * A badge rather than a sentence: the row is a choice being refused, and the
 * tier is the reason, so it belongs on the row rather than under the menu.
 */
async function menu(
	lockedLabel?: (provider: { kind: string }) => string | null,
) {
	const onPick = mock(() => {});
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<DropdownMenu open>
				<DropdownMenuContent>
					<TriggerMenuItems
						providers={TRIGGER_PROVIDERS}
						onPick={onPick}
						lockedLabel={lockedLabel as never}
					/>
				</DropdownMenuContent>
			</DropdownMenu>,
		);
	});
	return { ui: within(view.baseElement as HTMLElement), onPick };
}

describe("a provider the plan cannot add", () => {
	const lockTeams = (provider: { kind: string }) =>
		provider.kind === "microsoft_teams" ? "Enterprise" : null;

	test("is badged with the tier it needs", async () => {
		const { ui } = await menu(lockTeams);
		expect(ui.getByText("Enterprise")).toBeDefined();
	});

	// Badged, not hidden: a provider that vanished would read as unsupported
	// rather than as something a plan unlocks.
	test("is still listed", async () => {
		const { ui } = await menu(lockTeams);
		expect(ui.getByText("Microsoft Teams")).toBeDefined();
	});

	test("cannot be chosen", async () => {
		const { ui } = await menu(lockTeams);
		const item = ui.getByText("Microsoft Teams").closest("[role=menuitem]");
		expect(item?.getAttribute("data-disabled")).not.toBeNull();
	});

	test("leaves the providers the plan allows alone", async () => {
		const { ui } = await menu(lockTeams);
		expect(ui.getByText("Slack")).toBeDefined();
		expect(ui.queryByText("Pro")).toBeNull();
	});
});

describe("a menu with nothing locked", () => {
	test("badges nothing", async () => {
		const { ui } = await menu(() => null);
		expect(ui.queryByText("Enterprise")).toBeNull();
		expect(ui.queryByText("Pro")).toBeNull();
	});

	// A provider with one trigger is the trigger — no submenu to open first.
	test("puts a single-trigger provider straight on the row", async () => {
		const { ui } = await menu(() => null);
		const webhook = ui
			.getByText("Webhook triggered")
			.closest("[role=menuitem]");
		expect(webhook).not.toBeNull();
	});
});
