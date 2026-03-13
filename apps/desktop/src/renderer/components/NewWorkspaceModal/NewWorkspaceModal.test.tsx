import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Reproduces GitHub issue #2235:
 * The "Create Workspace" modal dismisses when the user Cmd+Tabs away and back.
 *
 * Root cause: The `Dialog` component in `packages/ui` defaults to `modal={false}`.
 * When a Radix UI Dialog is non-modal, its internal `DismissableLayer` fires
 * `onOpenChange(false)` in response to `focusoutside` events, which are triggered
 * when the browser window loses and regains focus (e.g. Cmd+Tab). This closes the
 * modal unintentionally.
 *
 * Fix: Pass `modal={true}` on the `<Dialog>` in `NewWorkspaceModal.tsx`. This
 * enables Radix's focus trap, preventing `DismissableLayer` from responding to
 * window-level focus changes.
 */

// Capture the `modal` prop received by the Dialog root
let capturedModalProp: boolean | undefined;

mock.module("@superset/ui/dialog", () => ({
	Dialog: ({
		modal,
		children,
	}: {
		modal?: boolean;
		children?: React.ReactNode;
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
	}) => {
		capturedModalProp = modal;
		return <div>{children}</div>;
	},
	DialogContent: ({ children }: { children?: React.ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children?: React.ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children?: React.ReactNode }) => (
		<div>{children}</div>
	),
	DialogDescription: ({ children }: { children?: React.ReactNode }) => (
		<div>{children}</div>
	),
}));

mock.module("@superset/ui/sonner", () => ({
	toast: { error: () => {} },
}));

mock.module("@tanstack/react-router", () => ({
	useNavigate: () => () => {},
}));

mock.module("renderer/react-query/projects", () => ({
	useOpenProject: () => ({ openNew: async () => {} }),
}));

mock.module("renderer/stores/new-workspace-modal", () => ({
	useNewWorkspaceModalOpen: () => true,
	useCloseNewWorkspaceModal: () => () => {},
	usePreSelectedProjectId: () => null,
}));

mock.module(
	"renderer/components/NewWorkspaceModal/components/NewWorkspaceModalContent",
	() => ({
		NewWorkspaceModalContent: () => null,
	}),
);

mock.module(
	"renderer/components/NewWorkspaceModal/NewWorkspaceModalDraftContext",
	() => ({
		NewWorkspaceModalDraftProvider: ({
			children,
		}: {
			children: React.ReactNode;
		}) => <>{children}</>,
	}),
);

const { NewWorkspaceModal } = await import("./NewWorkspaceModal");

describe("NewWorkspaceModal - Cmd+Tab dismissal (#2235)", () => {
	test("Dialog must be rendered with modal={true} to prevent Cmd+Tab dismissal", () => {
		capturedModalProp = undefined;

		renderToStaticMarkup(<NewWorkspaceModal />);

		/**
		 * When modal={false} (the Radix default and previous bug state), the
		 * DismissableLayer inside Radix Dialog listens for `focusoutside` events.
		 * A Cmd+Tab away from and back to the app causes the browser to fire focus
		 * events that Radix misinterprets as the user clicking outside the dialog,
		 * triggering onOpenChange(false) and closing the modal.
		 *
		 * With modal={true}, Radix installs a focus trap and does NOT respond to
		 * window-level focus changes, so the modal stays open across Cmd+Tab.
		 */
		expect(capturedModalProp).toBe(true);
	});
});
