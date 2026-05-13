export function indexBy<T, K>(
	items: ReadonlyArray<T | null | undefined>,
	getKey: (item: T) => K,
): Map<K, T> {
	const map = new Map<K, T>();
	for (const item of items) {
		if (item == null) continue;
		map.set(getKey(item), item);
	}
	return map;
}
