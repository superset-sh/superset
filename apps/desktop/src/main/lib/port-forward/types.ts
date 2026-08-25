import type { Duplex } from "node:stream";
import type { ForwardTarget, ForwardTransportKind } from "shared/types";

/**
 * How bytes get from the local machine to 127.0.0.1:<remotePort> on the host.
 * The relay implementation ships first; a direct (Tailscale, VPN, LAN) or SSH
 * implementation plugs in here without touching the manager or the UI.
 */
export interface ForwardTransport {
	readonly kind: ForwardTransportKind;
	/** Resolves when the transport can serve this host; rejects with a reason. */
	probe(target: Pick<ForwardTarget, "hostUrl">): Promise<void>;
	/** One bidirectional byte stream to 127.0.0.1:<remotePort> on the host. */
	openStream(target: ForwardTarget): Promise<Duplex>;
}
