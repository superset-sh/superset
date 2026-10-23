function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object") return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/**
 * What makes an array item "the same item" across runs: its `id`, or the id
 * of the workspace or section a child wrapper carries. Items without one are
 * paired by position.
 */
function identityOf(item: unknown): string | undefined {
	if (!isPlainObject(item)) return undefined;
	if (typeof item.id === "string") return item.id;
	if (isPlainObject(item.workspace) && typeof item.workspace.id === "string") {
		return `workspace:${item.workspace.id}`;
	}
	if (isPlainObject(item.section) && typeof item.section.id === "string") {
		return `section:${item.section.id}`;
	}
	return undefined;
}

/**
 * Returns `next` with every subtree that equals its counterpart in `previous`
 * replaced by the previous reference, or `previous` itself when nothing
 * changed. Plain objects and arrays compare by content and Dates by time;
 * anything else (functions, Maps, class instances) compares by identity.
 * Unlike TanStack's `replaceEqualDeep`, a rebuilt Date with the same time is
 * not a change, and array items are paired by identity rather than index.
 */
export function shareStructure<Value>(previous: unknown, next: Value): Value {
	if (previous === next) return next;
	if (previous instanceof Date && next instanceof Date) {
		return (previous.getTime() === next.getTime() ? previous : next) as Value;
	}
	if (Array.isArray(previous) && Array.isArray(next)) {
		// Pair by identity so an inserted, removed or moved item does not make
		// every item after it look changed.
		const previousByIdentity = new Map<string, unknown>();
		for (const item of previous) {
			const identity = identityOf(item);
			if (identity !== undefined) previousByIdentity.set(identity, item);
		}
		const shared = next.map((item, index) => {
			const identity = identityOf(item);
			const counterpart =
				identity !== undefined && previousByIdentity.has(identity)
					? previousByIdentity.get(identity)
					: previous[index];
			return shareStructure(counterpart, item);
		});
		const same =
			shared.length === previous.length &&
			shared.every((item, index) => item === previous[index]);
		return (same ? previous : shared) as Value;
	}
	if (isPlainObject(previous) && isPlainObject(next)) {
		const nextKeys = Object.keys(next);
		const shared: Record<string, unknown> = {};
		let same = nextKeys.length === Object.keys(previous).length;
		for (const key of nextKeys) {
			shared[key] = shareStructure(previous[key], next[key]);
			if (shared[key] !== previous[key]) same = false;
		}
		return (same ? previous : shared) as Value;
	}
	return next;
}
