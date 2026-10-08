import type { RealtimeClientEvent, RealtimeServerEvent } from "../events";

export type TransportState =
	| "idle"
	| "connecting"
	| "open"
	| "closed"
	| "failed";

export interface AudioLevels {
	/** 0..1, the user's microphone. */
	input: number;
	/** 0..1, the model's voice. */
	output: number;
}

/**
 * The seam between the voice session and whatever carries audio and events.
 * Kept to these calls so the WebRTC library can be swapped for a vendored
 * framework without touching the client above it.
 */
export interface RealtimeTransport {
	/** The secret may still be on its way: local audio setup does not wait for it. */
	connect(args: { clientSecret: string | Promise<string> }): Promise<void>;
	send(event: RealtimeClientEvent): void;
	onEvent(listener: (event: RealtimeServerEvent) => void): () => void;
	onStateChange(listener: (state: TransportState) => void): () => void;
	setMuted(muted: boolean): void;
	getLevels(): Promise<AudioLevels>;
	close(): void;
}
