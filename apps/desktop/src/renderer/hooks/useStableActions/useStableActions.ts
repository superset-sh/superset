import { useMemo, useRef } from "react";

/**
 * Wraps `read()` in a view whose identity never changes: every property and
 * method is looked up on the latest value at the moment it is used. Nested
 * objects get the same treatment, and the wrapper for a path is cached, so a
 * function read twice is the same function.
 */
export function createStableDelegate<Actions extends object>(
	read: () => Actions,
): Actions {
	const cache = new Map<string, unknown>();
	const delegate = (path: readonly string[]): unknown => {
		const key = path.join("\u0000");
		const cached = cache.get(key);
		if (cached) return cached;
		const resolve = (): unknown =>
			path.reduce<unknown>(
				(value, segment) =>
					(value as Record<string, unknown> | undefined)?.[segment],
				read(),
			);
		const target = path.length === 0 ? {} : () => undefined;
		const view = new Proxy(target, {
			get(_target, property) {
				if (typeof property === "symbol") return undefined;
				const next = (resolve() as Record<string, unknown> | undefined)?.[
					property
				];
				if (next !== null && typeof next === "object") {
					return delegate([...path, property]);
				}
				if (typeof next === "function") return delegate([...path, property]);
				return next;
			},
			apply(_target, _this, args) {
				return (resolve() as (...callArgs: unknown[]) => unknown)(...args);
			},
		});
		cache.set(key, view);
		return view;
	};
	return delegate([]) as Actions;
}

/**
 * A hook's action object, minus the subscriptions it drags along. The source
 * hook still re-renders whoever calls it; give the result to a provider so
 * the many consumers (a sidebar row each) read a value that never changes
 * and no longer re-render with the data the actions close over.
 */
export function useStableActions<Actions extends object>(
	actions: Actions,
): Actions {
	const latest = useRef(actions);
	latest.current = actions;
	return useMemo(() => createStableDelegate(() => latest.current), []);
}
