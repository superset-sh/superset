export interface QuotaSnapshot<T> {
	revision: string;
	load: () => Promise<T>;
}

export function createQuotaCache<T>(
	capture: () => Promise<QuotaSnapshot<T>>,
	ttlMs: number,
	now = Date.now,
) {
	let generation = 0;
	let revision: string | undefined;
	let cached: { value: T; fetchedAt: number } | undefined;
	let pending: Promise<T> | undefined;
	let reading: Promise<unknown> = Promise.resolve();
	let checking: Promise<QuotaSnapshot<T>> | undefined;

	function invalidate() {
		generation++;
		cached = undefined;
		pending = undefined;
	}

	function inspect() {
		const result = reading.then(capture).then(
			(snapshot) => {
				if (snapshot.revision !== revision) {
					invalidate();
					revision = snapshot.revision;
				}
				return snapshot;
			},
			() => {
				invalidate();
				throw new Error("Quota credentials could not be verified. Try again.");
			},
		);
		reading = result.catch(() => {});
		return result;
	}

	return {
		async get(forceRefresh = false): Promise<T> {
			if (!checking) {
				const check = inspect().finally(() => {
					if (checking === check) checking = undefined;
				});
				checking = check;
			}
			const snapshot = await checking;
			if (pending) return pending;
			if (!forceRefresh && cached && now() - cached.fetchedAt < ttlMs) {
				return cached.value;
			}
			const requestGeneration = generation;
			const request = Promise.resolve()
				.then(snapshot.load)
				.then(async (value) => {
					const current = await inspect();
					if (
						generation !== requestGeneration ||
						current.revision !== snapshot.revision
					) {
						throw new Error(
							"Quota credentials changed during the request. Try again.",
						);
					}
					cached = { value, fetchedAt: now() };
					return value;
				})
				.catch((error: unknown) => {
					if (generation === requestGeneration) cached = undefined;
					throw error;
				})
				.finally(() => {
					if (pending === request) pending = undefined;
				});
			pending = request;
			return request;
		},
		invalidate,
	};
}
