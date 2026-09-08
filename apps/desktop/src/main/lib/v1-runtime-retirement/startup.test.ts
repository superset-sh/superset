import { describe, expect, test } from "bun:test";
import { V1RuntimeStartup } from "./startup";

describe("v1 runtime startup", () => {
	test("a reversible v2 report cannot consume a later v1 window's warmup", async () => {
		let reconciles = 0;
		let warmups = 0;
		const startup = new V1RuntimeStartup({
			reconcile: async () => {
				reconciles++;
				return true;
			},
			prewarm: () => {
				warmups++;
			},
		});
		await startup.start(false, () => true);
		expect(warmups).toBe(0);
		await Promise.all([
			startup.start(true, () => true),
			startup.start(true, () => true),
		]);
		expect({ reconciles, warmups }).toEqual({ reconciles: 1, warmups: 1 });
	});

	test.each([
		false,
		true,
	])("retries unsuccessful reconciliation (throws: %s)", async (throws) => {
		let reconciles = 0;
		let warmups = 0;
		const startup = new V1RuntimeStartup({
			reconcile: async () => {
				if (++reconciles === 1) {
					if (throws) throw new Error("offline");
					return false;
				}
				return true;
			},
			prewarm: () => {
				warmups++;
			},
		});
		if (throws)
			await expect(startup.start(true, () => true)).rejects.toThrow("offline");
		else await startup.start(true, () => true);
		expect(warmups).toBe(0);
		await startup.start(true, () => true);
		expect({ reconciles, warmups }).toEqual({ reconciles: 2, warmups: 1 });
	});

	test("shares an in-flight probe and skips warmup when the window becomes locked", async () => {
		const probe = Promise.withResolvers<boolean>();
		let reconciles = 0;
		let warmups = 0;
		let allowed = true;
		const startup = new V1RuntimeStartup({
			reconcile: () => {
				reconciles++;
				return probe.promise;
			},
			prewarm: () => {
				warmups++;
			},
		});
		const pending = [
			startup.start(true, () => allowed),
			startup.start(true, () => allowed),
		];
		allowed = false;
		probe.resolve(true);
		await Promise.all(pending);
		expect({ reconciles, warmups }).toEqual({ reconciles: 1, warmups: 0 });
		await startup.start(true, () => false);
		expect(reconciles).toBe(1);
	});

	test("retirement resets startup and invalidates an old pending warmup", async () => {
		const probe = Promise.withResolvers<boolean>();
		let reconciles = 0;
		let warmups = 0;
		const startup = new V1RuntimeStartup({
			reconcile: () =>
				++reconciles === 1 ? probe.promise : Promise.resolve(true),
			prewarm: () => {
				warmups++;
			},
		});
		const old = startup.start(true, () => true);
		startup.reset();
		probe.resolve(true);
		await old;
		expect(warmups).toBe(0);
		await startup.start(true, () => true);
		expect({ reconciles, warmups }).toEqual({ reconciles: 2, warmups: 1 });
	});
});
