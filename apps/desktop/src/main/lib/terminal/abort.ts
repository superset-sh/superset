import { TerminalAttachCanceledError } from "./errors";

export function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new TerminalAttachCanceledError();
	}
}

export function raceWithAbort<T>(
	promise: Promise<T>,
	signal?: AbortSignal,
): Promise<T> {
	if (!signal) {
		return promise;
	}
	if (signal.aborted) {
		return Promise.reject(new TerminalAttachCanceledError());
	}

	return new Promise<T>((resolve, reject) => {
		const onAbort = () => {
			reject(new TerminalAttachCanceledError());
		};
		signal.addEventListener("abort", onAbort, { once: true });
		promise
			.then((value) => {
				signal.removeEventListener("abort", onAbort);
				resolve(value);
			})
			.catch((error) => {
				signal.removeEventListener("abort", onAbort);
				reject(error);
			});
	});
}
