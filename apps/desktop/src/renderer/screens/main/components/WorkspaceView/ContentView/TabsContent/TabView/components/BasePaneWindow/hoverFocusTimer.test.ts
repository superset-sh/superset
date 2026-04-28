import { describe, expect, it, mock } from "bun:test";
import { createHoverFocusTimer } from "./hoverFocusTimer";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createHoverFocusTimer", () => {
	it("fires onFire after delayMs when enter() is called", async () => {
		const onFire = mock(() => {});
		const timer = createHoverFocusTimer({ delayMs: 30, onFire });
		timer.enter();
		expect(onFire).not.toHaveBeenCalled();
		await tick(60);
		expect(onFire).toHaveBeenCalledTimes(1);
	});

	it("leave() cancels a pending fire", async () => {
		const onFire = mock(() => {});
		const timer = createHoverFocusTimer({ delayMs: 30, onFire });
		timer.enter();
		timer.leave();
		await tick(60);
		expect(onFire).not.toHaveBeenCalled();
	});

	it("double enter() only schedules one fire", async () => {
		const onFire = mock(() => {});
		const timer = createHoverFocusTimer({ delayMs: 30, onFire });
		timer.enter();
		timer.enter();
		await tick(60);
		expect(onFire).toHaveBeenCalledTimes(1);
	});

	it("isSuppressed returning true at fire time skips onFire", async () => {
		const onFire = mock(() => {});
		const timer = createHoverFocusTimer({
			delayMs: 30,
			onFire,
			isSuppressed: () => true,
		});
		timer.enter();
		await tick(60);
		expect(onFire).not.toHaveBeenCalled();
	});

	it("isSuppressed returning false at fire time still fires", async () => {
		const onFire = mock(() => {});
		const timer = createHoverFocusTimer({
			delayMs: 30,
			onFire,
			isSuppressed: () => false,
		});
		timer.enter();
		await tick(60);
		expect(onFire).toHaveBeenCalledTimes(1);
	});

	it("dispose() cancels a pending fire", async () => {
		const onFire = mock(() => {});
		const timer = createHoverFocusTimer({ delayMs: 30, onFire });
		timer.enter();
		timer.dispose();
		await tick(60);
		expect(onFire).not.toHaveBeenCalled();
	});

	it("supports re-entering after a fire", async () => {
		const onFire = mock(() => {});
		const timer = createHoverFocusTimer({ delayMs: 20, onFire });
		timer.enter();
		await tick(40);
		expect(onFire).toHaveBeenCalledTimes(1);
		timer.enter();
		await tick(40);
		expect(onFire).toHaveBeenCalledTimes(2);
	});

	it("re-entering after a leave fires once", async () => {
		const onFire = mock(() => {});
		const timer = createHoverFocusTimer({ delayMs: 30, onFire });
		timer.enter();
		timer.leave();
		timer.enter();
		await tick(60);
		expect(onFire).toHaveBeenCalledTimes(1);
	});
});
