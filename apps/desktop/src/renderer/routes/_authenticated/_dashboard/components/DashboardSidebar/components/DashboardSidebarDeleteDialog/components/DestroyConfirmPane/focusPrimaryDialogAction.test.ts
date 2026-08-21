import { describe, expect, test } from "bun:test";
import { focusPrimaryDialogAction } from "./focusPrimaryDialogAction";

/**
 * Reproduces GitHub issue #5764:
 * Triggering the delete-workspace modal via the CLOSE_WORKSPACE hotkey (⌘⇧⌫)
 * showed the dialog but "lost the focus", so pressing Enter did nothing and the
 * user had to reach for the mouse.
 *
 * Root cause: the v2 DestroyConfirmPane (which replaced the v1
 * DeleteWorkspaceDialog for cloud workspaces) dropped the v1 dialog's
 * `onOpenAutoFocus` behaviour. Its footer uses plain Buttons instead of
 * AlertDialogAction/AlertDialogCancel, so Radix's default open autofocus left
 * focus on the non-actionable content wrapper.
 *
 * Fix: on open, move focus to the first enabled action button (primary
 * destructive action first, Cancel as a fallback) — mirroring the v1 dialog.
 */
describe("DestroyConfirmPane focus-on-open (#5764)", () => {
	test("moves focus to the primary destructive action so Enter confirms", () => {
		const focused: string[] = [];
		let prevented = false;
		const confirm = { focus: () => focused.push("confirm"), disabled: false };
		const cancel = { focus: () => focused.push("cancel"), disabled: false };

		focusPrimaryDialogAction(
			{
				preventDefault: () => {
					prevented = true;
				},
			},
			[confirm, cancel],
		);

		// Default Radix autofocus is overridden and focus lands on the
		// actionable destructive button.
		expect(prevented).toBe(true);
		expect(focused).toEqual(["confirm"]);
	});

	test("falls back to Cancel when the destructive action is disabled", () => {
		const focused: string[] = [];
		const confirm = { focus: () => focused.push("confirm"), disabled: true };
		const cancel = { focus: () => focused.push("cancel"), disabled: false };

		focusPrimaryDialogAction({ preventDefault: () => {} }, [confirm, cancel]);

		expect(focused).toEqual(["cancel"]);
	});

	test("defers to Radix when there is no focusable target (never strands focus)", () => {
		let prevented = false;

		focusPrimaryDialogAction(
			{
				preventDefault: () => {
					prevented = true;
				},
			},
			[null, null],
		);

		// With nothing to focus we must NOT preventDefault, otherwise focus would
		// be stranded outside the dialog — the exact "focus lost" symptom.
		expect(prevented).toBe(false);
	});
});
