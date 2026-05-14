export const TERMINAL_SESSION_REPLAY_BLOCK_CLASS = "ph-no-capture";
export const TERMINAL_SESSION_REPLAY_BLOCK_ATTRIBUTE =
	"data-terminal-replay-blocked";

type ReplayBlockedElement = Element & {
	classList?: {
		add?: (...tokens: string[]) => void;
	};
	setAttribute?: (qualifiedName: string, value: string) => void;
};

export function markTerminalSessionReplayBlocked(element: Element): void {
	const target = element as ReplayBlockedElement;
	target.classList?.add?.(TERMINAL_SESSION_REPLAY_BLOCK_CLASS);
	target.setAttribute?.("data-ph-no-capture", "true");
	target.setAttribute?.(TERMINAL_SESSION_REPLAY_BLOCK_ATTRIBUTE, "true");
}
