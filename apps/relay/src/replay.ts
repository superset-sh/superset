export interface FlyLocation {
	region: string;
	machineId: string;
}

export interface ReplayInstruction {
	header: Record<string, string>;
	kind: "instance";
}

/**
 * Decide the `fly-replay` header that routes a host-scoped request to the
 * machine that currently owns the tunnel. Returns `null` when this machine is
 * the owner (nothing to replay).
 *
 * We always target the owning *instance* (`fly-replay: instance=<id>`), not its
 * region. `instance` routing is global — Fly forwards to that exact Machine
 * wherever it lives, so the request lands on the tunnel owner in a single hop.
 *
 * Targeting `region=<code>` cross-region is wrong: Fly picks an *arbitrary*
 * machine in that region, which may not be the one holding the tunnel. That
 * machine then has to replay again to reach the owner — but Fly only honors one
 * replay per request, so the second hop is dropped and the edge returns 502.
 * HTTP/tRPC happened to survive this because retries papered over it, but
 * WebSocket upgrades can't retry mid-handshake, so they surface the misroute as
 * a stuck `Disconnected` terminal (#5456).
 */
export function computeReplay(
	owner: FlyLocation,
	self: FlyLocation,
): ReplayInstruction | null {
	if (owner.region === self.region && owner.machineId === self.machineId) {
		return null;
	}
	return {
		header: { "fly-replay": `instance=${owner.machineId}` },
		kind: "instance",
	};
}
