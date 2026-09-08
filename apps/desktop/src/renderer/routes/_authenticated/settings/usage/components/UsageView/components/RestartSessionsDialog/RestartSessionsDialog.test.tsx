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
const { RestartSessionsDialog } = await import("./RestartSessionsDialog");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const prompt = {
	agent: "claude" as const,
	providerLabel: "Claude Code",
	accountLabel: "a@example.com",
	count: 2,
};

describe("RestartSessionsDialog", () => {
	// The pinned sessions relaunch onto the very same config dir, so offering
	// a restart would promise a move that cannot happen.
	test("states what stays behind and offers no restart", () => {
		const view = render(
			<RestartSessionsDialog prompt={prompt} onDismiss={() => {}} />,
		);
		const text = view.baseElement.textContent ?? "";

		expect(text).toContain(
			"Some Claude Code sessions stay on their own account",
		);
		expect(text).toContain("2 running agents are pinned");
		expect(text).not.toContain("Restart");
		expect(
			within(view.baseElement as HTMLElement).getAllByRole("button"),
		).toHaveLength(1);
	});

	test("dismisses once from the only button there is", () => {
		let dismissals = 0;
		const view = render(
			<RestartSessionsDialog
				prompt={prompt}
				onDismiss={() => {
					dismissals += 1;
				}}
			/>,
		);

		fireEvent.click(
			within(view.baseElement as HTMLElement).getByRole("button", {
				name: "OK",
			}),
		);

		expect(dismissals).toBe(1);
	});

	test("says nothing at all while there is no prompt", () => {
		const view = render(
			<RestartSessionsDialog prompt={null} onDismiss={() => {}} />,
		);
		expect(view.baseElement.textContent).toBe("");
	});
});
