export function parsePositiveIntegerParam(value: string): number | null {
	if (!/^[1-9]\d*$/.test(value)) return null;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : null;
}
