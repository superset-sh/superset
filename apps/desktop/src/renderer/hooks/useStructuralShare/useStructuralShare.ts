import { useMemo, useRef } from "react";
import { shareStructure } from "./shareStructure";

/**
 * Keeps the previous reference for every part of `value` that did not change.
 * A builder that returns fresh objects on every run (the sidebar tree) would
 * otherwise hand each row a new `workspace` prop on any change, defeating
 * every memo below it.
 */
export function useStructuralShare<Value>(value: Value): Value {
	const previous = useRef(value);
	return useMemo(() => {
		const shared = shareStructure(previous.current, value);
		previous.current = shared;
		return shared;
	}, [value]);
}
