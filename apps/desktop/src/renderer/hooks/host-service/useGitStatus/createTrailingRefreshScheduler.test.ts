import { describe, expect, test } from "bun:test";
import { createTrailingRefreshScheduler } from "./createTrailingRefreshScheduler";

function deferred() {
	let resolve: () => void = () => {};
	const promise = new Promise<void>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

describe("createTrailingRefreshScheduler", () => {
	test("coalesces events during an active refresh into one trailing refresh", async () => {
		const first = deferred();
		const second = deferred();
		let runs = 0;
		const scheduler = createTrailingRefreshScheduler(async () => {
			runs++;
			await (runs === 1 ? first.promise : second.promise);
		});

		const drain = scheduler.request();
		void scheduler.request();
		void scheduler.request();
		expect(runs).toBe(1);

		first.resolve();
		await Bun.sleep(0);
		expect(runs).toBe(2);

		second.resolve();
		await drain;
		expect(runs).toBe(2);
	});

	test("runs again after the previous drain completes", async () => {
		let runs = 0;
		const scheduler = createTrailingRefreshScheduler(async () => {
			runs++;
		});

		await scheduler.request();
		await scheduler.request();

		expect(runs).toBe(2);
	});

	test("does not start a trailing refresh after disposal", async () => {
		const first = deferred();
		let runs = 0;
		const scheduler = createTrailingRefreshScheduler(async () => {
			runs++;
			await first.promise;
		});

		const drain = scheduler.request();
		void scheduler.request();
		scheduler.dispose();
		first.resolve();
		await drain;

		expect(runs).toBe(1);
		await scheduler.request();
		expect(runs).toBe(1);
	});

	test("keeps a queued trailing refresh after a transient failure", async () => {
		const first = deferred();
		let runs = 0;
		const scheduler = createTrailingRefreshScheduler(async () => {
			runs++;
			if (runs === 1) {
				await first.promise;
				throw new Error("temporary failure");
			}
		});

		const drain = scheduler.request();
		void scheduler.request();
		first.resolve();
		await drain;

		expect(runs).toBe(2);
	});
});
