import type { Duplex } from "node:stream";
import type { ForwardTarget, ForwardTransportKind } from "shared/types";

/**
 * How bytes get from the local machine to 127.0.0.1:<remotePort> on the host.
 * The relay implementation ships first; a direct (Tailscale, VPN, LAN) or SSH
 * implementation plugs in here without touching the manager or the UI.
 */
export interface ForwardTransport {
	readonly kind: ForwardTransportKind;
	/**
	 * Resolves when the transport can serve this target; rejects with a
	 * reason. Also where a transport warms anything it wants ready before the
	 * first connection (the relay transport establishes its mux session here,
	 * so an unsupported host errors the row at sync time, not on first click).
	 */
	probe(target: ForwardTarget): Promise<void>;
	/** One bidirectional byte stream to 127.0.0.1:<remotePort> on the host. */
	openStream(target: ForwardTarget): Promise<Duplex>;
}
