import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { toast } from "@superset/ui/sonner";

// happy-dom over the preloaded plain-object document. Process-wide, so this
// unregisters in afterAll to leave the other renderer suites their document.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Logins = {
	claude: {
		configDir: string;
		email: string | null;
		credentialKind: string;
		fingerprint: string | null;
	}[];
	codex: unknown[];
	claudeDefaultEmail: string | null;
};

// What the dialog's poll answers with; the tests move it from the baseline to
// the login the user just signed in to, which is what reveals the button.
let logins: Logins | null = null;
mock.module("../../../../hooks/useHostUsageLogins", () => ({
	useHostUsageLogins: () => ({ data: logins }),
}));

// How the host answers the switch: null succeeds, an Error refuses with the
// bare code it puts in the tRPC error message.
let refusal: Error | null = null;
mock.module("../../../../hooks/useSetDefaultUsageAccount", () => ({
	useSetDefaultUsageAccount: () => ({
		isPending: false,
		mutate: (
			_input: unknown,
			handlers: { onSuccess?: () => void; onError?: (error: unknown) => void },
		) => {
			if (refusal) handlers.onError?.(refusal);
			else handlers.onSuccess?.();
		},
	}),
}));

// Patch the real toast object rather than mock.module: the dialog may already
// hold a binding to it from another test file's import order.
const errorToasts: string[] = [];
const realError = toast.error;
toast.error = ((message: string) => {
	errorToasts.push(message);
}) as typeof toast.error;

const { cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { AddAccountDialog } = await import("./AddAccountDialog");

afterEach(() => {
	cleanup();
	errorToasts.length = 0;
	refusal = null;
});
afterAll(async () => {
	toast.error = realError;
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const BASELINE: Logins = { claude: [], codex: [], claudeDefaultEmail: null };
const SIGNED_IN: Logins = {
	claude: [
		{
			configDir: "/p/work",
			email: "work@example.com",
			credentialKind: "subscription",
			fingerprint: null,
		},
	],
	codex: [],
	claudeDefaultEmail: null,
};

function dialog() {
	return (
		<AddAccountDialog
			open
			onOpenChange={() => {}}
			hostUrl={null}
			agent="claude"
			onAccountAdded={() => {}}
			onDefaultSwitched={() => {}}
		/>
	);
}

/** Opens on the baseline, then lets the new sign-in land. */
function renderAfterSignIn() {
	logins = BASELINE;
	const view = render(dialog());
	logins = SIGNED_IN;
	view.rerender(dialog());
	return view;
}

describe("AddAccountDialog", () => {
	test("offers the new account as the active one, not just for new agents", () => {
		const view = renderAfterSignIn();
		const ui = within(view.baseElement as HTMLElement);
		const button = ui.getByText("Make active").closest("button");
		// The old wording promised new agents only, while the switch moves the
		// sessions already running.
		expect(view.baseElement.textContent).not.toContain("Use for new agents");
		expect(button?.getAttribute("title")).toBe(
			"Active — every running and newly launched session of this agent uses this account.",
		);
	});

	test("a refused switch says so in words, not as the host's bare code", () => {
		refusal = new Error("lock-loser");
		const view = renderAfterSignIn();
		fireEvent.click(
			within(view.baseElement as HTMLElement).getByText("Make active"),
		);
		expect(errorToasts).toEqual([
			"Switch failed (lock-loser). The previous account is still active.",
		]);
	});
});
