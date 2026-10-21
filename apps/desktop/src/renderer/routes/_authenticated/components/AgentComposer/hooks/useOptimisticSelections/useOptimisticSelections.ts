import { useCallback, useEffect, useRef, useState } from "react";

type Pending = { value: string; base: string | undefined };

export type OptimisticSelections = {
	/** The settled value, or the picked one while the agent has not echoed it. */
	shown: (key: string) => string | undefined;
	/** Show `value` for `key` now; `commit` sends it to the agent. */
	select: (key: string, value: string, commit: () => void) => void;
};

/**
 * Session config and mode changes round-trip through the agent before the
 * snapshot reflects them, so a controlled picker would show the old value for
 * a few hundred milliseconds. A pick is shown at once and dropped when the
 * settled value moves off the one it was picked against — the echo arrived,
 * or something else changed it — or after `settleMs` if nothing ever comes.
 */
export function useOptimisticSelections(
	settled: Record<string, string | undefined>,
	settleMs = 2000,
): OptimisticSelections {
	const [pending, setPending] = useState<ReadonlyMap<string, Pending>>(
		() => new Map(),
	);
	const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

	useEffect(() => {
		const active = timers.current;
		return () => {
			for (const timer of active.values()) clearTimeout(timer);
		};
	}, []);

	const forget = useCallback((key: string, entry: Pending) => {
		timers.current.delete(key);
		setPending((current) => {
			if (current.get(key) !== entry) return current;
			const next = new Map(current);
			next.delete(key);
			return next;
		});
	}, []);

	const select = useCallback(
		(key: string, value: string, commit: () => void) => {
			const entry: Pending = { value, base: settled[key] };
			setPending((current) => new Map(current).set(key, entry));
			const existing = timers.current.get(key);
			if (existing) clearTimeout(existing);
			timers.current.set(
				key,
				setTimeout(() => forget(key, entry), settleMs),
			);
			commit();
		},
		[forget, settleMs, settled],
	);

	const shown = useCallback(
		(key: string) => {
			const entry = pending.get(key);
			if (entry && settled[key] === entry.base) return entry.value;
			return settled[key];
		},
		[pending, settled],
	);

	return { shown, select };
}
