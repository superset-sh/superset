export interface ScaleUnit {
	limit: number;
	suffix: string;
	digits: number;
}

/**
 * Renders a value against the largest unit it clears, then re-checks the
 * rounded result: rounding can carry a value into the next unit, so 999,999
 * must read 1.0M rather than 1000K.
 *
 * Only carries between suffixed units. A value below the smallest unit is
 * handed to `base` as-is, so a formatter with decimals can still render e.g.
 * 999.999 as "1000.00" — unscaled, but not misleading the way "1000K" is.
 */
export function formatScaled(
	value: number,
	units: readonly ScaleUnit[],
	base: (value: number) => string,
): string {
	for (const [index, unit] of units.entries()) {
		if (value < unit.limit) continue;
		const carried = Number((value / unit.limit).toFixed(unit.digits)) >= 1000;
		const target = (carried ? units[index - 1] : undefined) ?? unit;
		return `${(value / target.limit).toFixed(target.digits)}${target.suffix}`;
	}
	return base(value);
}
