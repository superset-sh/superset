export type Coalescer<T> = {
	push: (value: T) => void;
	flush: () => void;
	dispose: () => void;
};

export function createCoalescer<T>(
	apply: (batch: T[]) => void,
	schedule: (callback: () => void) => () => void,
): Coalescer<T> {
	let pending: T[] = [];
	let cancel: (() => void) | null = null;
	let disposed = false;

	const flush = () => {
		if (cancel) {
			cancel();
			cancel = null;
		}
		if (pending.length === 0) return;
		const batch = pending;
		pending = [];
		apply(batch);
	};

	return {
		push: (value: T) => {
			if (disposed) return;
			pending.push(value);
			if (!cancel) cancel = schedule(flush);
		},
		flush,
		dispose: () => {
			flush();
			disposed = true;
		},
	};
}
