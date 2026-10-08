export type Wait = (callback: () => void, delayMs: number) => () => void;

const defaultWait: Wait = (callback, delayMs) => {
	const timer = setTimeout(callback, delayMs);
	return () => clearTimeout(timer);
};

export async function createWhenReachable<T>({
	attempt,
	isReachableFailure,
	shouldContinue,
	onUnreachable,
	wait = defaultWait,
	timeoutMs = 15_000,
	initialDelayMs = 1_000,
	maxDelayMs = 10_000,
}: {
	attempt: () => Promise<T>;
	isReachableFailure: (error: unknown) => boolean;
	shouldContinue: () => boolean;
	onUnreachable: (unreachable: boolean) => void;
	wait?: Wait;
	timeoutMs?: number;
	initialDelayMs?: number;
	maxDelayMs?: number;
}): Promise<T> {
	for (let tries = 0; ; tries += 1) {
		try {
			const result = await new Promise<T>((resolve, reject) => {
				const cancel = wait(() => reject(new Error("timed out")), timeoutMs);
				attempt().then(
					(value) => {
						cancel();
						resolve(value);
					},
					(error: unknown) => {
						cancel();
						reject(error);
					},
				);
			});
			onUnreachable(false);
			return result;
		} catch (error) {
			if (isReachableFailure(error) || !shouldContinue()) throw error;
			onUnreachable(true);
			await new Promise<void>((resolve) =>
				wait(resolve, Math.min(initialDelayMs * 2 ** tries, maxDelayMs)),
			);
		}
	}
}
