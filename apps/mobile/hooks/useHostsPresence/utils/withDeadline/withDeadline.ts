export function withDeadline<T>(
	work: (signal: AbortSignal) => Promise<T>,
	ms: number,
	signal?: AbortSignal,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const controller = new AbortController();
		const cleanup = () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
		};
		const cancel = (error: unknown) => {
			cleanup();
			reject(error);
			controller.abort();
		};
		const onAbort = () => cancel(new Error("presence request cancelled"));
		const timer = setTimeout(
			() => cancel(new Error(`timed out after ${ms}ms`)),
			ms,
		);
		if (signal?.aborted) {
			onAbort();
			return;
		}
		signal?.addEventListener("abort", onAbort, { once: true });
		Promise.resolve()
			.then(() => {
				if (controller.signal.aborted) {
					throw new Error("presence request cancelled");
				}
				return work(controller.signal);
			})
			.then((value) => {
				cleanup();
				resolve(value);
			}, cancel);
	});
}
