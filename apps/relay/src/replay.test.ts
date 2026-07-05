import { describe, expect, test } from "bun:test";
import { computeReplay } from "./replay";

// Reproduction for #5456: WebSocket relay misroutes terminal sessions across
// regions. When the tunnel owner lives in a different Fly region, the relay
// must forward the request straight to the owning *instance* so it lands there
// in a single fly-replay hop. Targeting the owner's *region* instead lets Fly
// pick any machine in that region; if it isn't the owner, that machine needs a
// second replay to reach the owner, which Fly drops (one replay per request) →
// 502 → terminal stuck "Disconnected".
describe("computeReplay", () => {
	const self: { region: string; machineId: string } = {
		region: "lhr",
		machineId: "lhr-machine-1",
	};

	test("returns null when this machine owns the tunnel", () => {
		expect(computeReplay(self, self)).toBeNull();
	});

	test("targets the owning instance when it is in this region", () => {
		const owner = { region: "lhr", machineId: "lhr-machine-2" };
		expect(computeReplay(owner, self)).toEqual({
			header: { "fly-replay": "instance=lhr-machine-2" },
			kind: "instance",
		});
	});

	// The core of #5456: owner is in `sin`, request landed in `lhr`.
	test("targets the owning instance across regions (not the region)", () => {
		const owner = { region: "sin", machineId: "sin-machine-1" };
		const replay = computeReplay(owner, self);
		// Must pin the exact owning machine so a single replay reaches it.
		// Routing to `region=sin` can land on a non-owning machine there, which
		// then can't replay again → Fly returns 502 on the WS upgrade.
		expect(replay?.header["fly-replay"]).toBe("instance=sin-machine-1");
	});
});
