// Handoff protocol — daemon-to-successor only. Travels over a dedicated
// control fd in the inherited stdio array of the successor process.
//
// This is NOT exposed to clients. Client wire protocol (`messages.ts`)
// stays at v1 — clients should never send or see these frames.
//
// Reuses the same length-prefixed JSON framing as the client wire so we
// can share encodeFrame/FrameDecoder.

export interface UpgradeAckMessage {
	type: "upgrade-ack";
	successorPid: number;
}

export interface UpgradeNakMessage {
	type: "upgrade-nak";
	reason: string;
}

/** Successor → predecessor over the control fd. */
export type HandoffMessage = UpgradeAckMessage | UpgradeNakMessage;
