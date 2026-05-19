export type WindowOpenDecision =
	| { kind: "external"; url: string }
	| { kind: "in-app"; url: string }
	| { kind: "ignore" };

// Chromium maps Cmd/Ctrl+click and middle-click to `background-tab`, which is
// the user's "open externally" gesture. Plain target="_blank" clicks come
// through as `foreground-tab` and stay in the in-app pane.
export function decideWindowOpen(
	url: string | undefined,
	disposition: string | undefined,
): WindowOpenDecision {
	if (!url || url === "about:blank") return { kind: "ignore" };
	if (disposition === "background-tab") return { kind: "external", url };
	return { kind: "in-app", url };
}
