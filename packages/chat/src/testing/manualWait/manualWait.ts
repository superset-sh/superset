import type { Wait } from "../../client";

export type ManualWait = {
	wait: Wait;
	delays: number[];
	flush(): void;
	pendingCount(): number;
};

export function createManualWait(): ManualWait {
	type Entry = { callback: () => void };
	let pending: Entry[] = [];
	const delays: number[] = [];
	const wait: Wait = (callback, delayMs) => {
		delays.push(delayMs);
		const entry: Entry = { callback };
		pending.push(entry);
		return () => {
			pending = pending.filter((candidate) => candidate !== entry);
		};
	};
	return {
		wait,
		delays,
		flush: () => {
			const batch = pending;
			pending = [];
			for (const entry of batch) entry.callback();
		},
		pendingCount: () => pending.length,
	};
}
