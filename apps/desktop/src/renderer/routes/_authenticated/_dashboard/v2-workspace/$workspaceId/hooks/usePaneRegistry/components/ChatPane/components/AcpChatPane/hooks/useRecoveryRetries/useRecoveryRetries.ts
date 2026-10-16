import { type RefObject, useEffect, useRef } from "react";

type Schedule = (run: () => void, delayMs: number) => () => void;
const scheduleTimeout: Schedule = (run, delayMs) => {
	const timer = setTimeout(run, delayMs);
	return () => clearTimeout(timer);
};

export function useRecoveryRetries({
	recoverable,
	replacementPending,
	attempts,
	inFlight,
	completion,
	failure,
	recover,
	limit,
	schedule = scheduleTimeout,
}: {
	recoverable: boolean;
	replacementPending: boolean;
	attempts: RefObject<number>;
	inFlight: RefObject<boolean>;
	/** Changes whenever an attempt settles, even when its error text repeats. */
	completion: number;
	failure: string | null;
	recover: () => void;
	limit: number;
	schedule?: Schedule;
}): boolean {
	const recovering =
		replacementPending ||
		(recoverable && (inFlight.current || attempts.current < limit));
	const latestCompletion = useRef(completion);
	latestCompletion.current = completion;
	useEffect(() => {
		if (!recovering || inFlight.current) return;
		const delayMs =
			attempts.current === 0 && failure === null
				? 0
				: 1_000 * 2 ** Math.max(attempts.current - 1, 0);
		return schedule(() => {
			if (latestCompletion.current !== completion || inFlight.current) return;
			attempts.current += 1;
			recover();
		}, delayMs);
	}, [recovering, recover, failure, completion, attempts, inFlight, schedule]);
	return recovering;
}
