import { TERMINAL_SEQ_KEY_PREFIX } from "./terminal-buffer-gc";

/**
 * Position in the host's PTY output stream, paired with the persisted buffer
 * snapshot: "this snapshot contains every byte of `epoch` up to `seq`". On
 * reattach the host sends exactly the missing suffix (see `?seq=` in
 * host-service terminal.ts), so a rebuilt runtime converges without replay
 * duplication or resets. Bounded by the buffer snapshot's own lifecycle —
 * always written/cleared alongside it and swept by the same GC.
 */
export interface TerminalSeqAnchor {
	epoch: string;
	seq: number;
}

export function persistSeqAnchor(
	terminalId: string,
	anchor: TerminalSeqAnchor | null,
): void {
	const key = `${TERMINAL_SEQ_KEY_PREFIX}${terminalId}`;
	try {
		if (anchor) {
			localStorage.setItem(key, JSON.stringify(anchor));
		} else {
			localStorage.removeItem(key);
		}
	} catch {
		// A failed write (quota) must not leave a STALE anchor paired with a
		// newer snapshot — the next attach would skip bytes the pane never
		// got. No anchor degrades safely to the reanchor path; removeItem
		// works even under quota pressure.
		try {
			localStorage.removeItem(key);
		} catch {}
	}
}

export function loadPersistedSeqAnchor(
	terminalId: string,
): TerminalSeqAnchor | null {
	try {
		const raw = localStorage.getItem(`${TERMINAL_SEQ_KEY_PREFIX}${terminalId}`);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			typeof (parsed as TerminalSeqAnchor).epoch === "string" &&
			typeof (parsed as TerminalSeqAnchor).seq === "number" &&
			Number.isSafeInteger((parsed as TerminalSeqAnchor).seq) &&
			(parsed as TerminalSeqAnchor).seq >= 0
		) {
			return {
				epoch: (parsed as TerminalSeqAnchor).epoch,
				seq: (parsed as TerminalSeqAnchor).seq,
			};
		}
		return null;
	} catch {
		return null;
	}
}
