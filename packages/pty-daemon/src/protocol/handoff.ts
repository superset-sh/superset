// Handoff protocol — daemon-to-successor only. Travels over a dedicated
// control fd in the inherited stdio array of the successor process.
//
// This is NOT exposed to clients. Client wire protocol (`messages.ts`)
// stays at v1 — clients should never send or see these frames.
//
// Reuses the same length-prefixed JSON framing as the client wire so we
// can share encodeFrame/FrameDecoder.

export interface UpgradeReadyMessage {
	type: "upgrade-ready";
	successorPid: number;
}

/**
 * Compatibility signal for predecessors shipped before the two-phase protocol.
 * New predecessors ignore it and require `upgrade-listening` after COMMIT.
 */
export interface UpgradeAckMessage {
	type: "upgrade-ack";
	successorPid: number;
}

/** Predecessor → successor after the final mutation/output quiescence check. */
export interface UpgradeCommitMessage {
	type: "upgrade-commit";
}

/** Successor → predecessor only after the canonical socket is live. */
export interface UpgradeListeningMessage {
	type: "upgrade-listening";
	successorPid: number;
}

export interface UpgradeNakMessage {
	type: "upgrade-nak";
	reason: string;
}

/** Bidirectional messages over the private parent/child IPC channel. */
export type HandoffMessage =
	| UpgradeReadyMessage
	| UpgradeAckMessage
	| UpgradeCommitMessage
	| UpgradeListeningMessage
	| UpgradeNakMessage;
