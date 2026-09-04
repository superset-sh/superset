export function createSerialQueue(): (
	job: () => Promise<void>,
) => Promise<void> {
	let tail: Promise<void> = Promise.resolve();

	return (job) => {
		const next = tail.then(job);
		tail = next.catch(() => undefined);
		return next;
	};
}
