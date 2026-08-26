import { formatScaled, type ScaleUnit } from "./format-scaled";

const UNITS: readonly ScaleUnit[] = [
	{ limit: 1e12, suffix: "T", digits: 2 },
	{ limit: 1e9, suffix: "B", digits: 1 },
	{ limit: 1e6, suffix: "M", digits: 1 },
	{ limit: 1e3, suffix: "K", digits: 0 },
];

/** "1.24T", "13.9B", "4.2M", "850K", "312" */
export function formatTokens(tokens: number): string {
	return formatScaled(tokens, UNITS, (value) =>
		Math.round(value).toLocaleString("en-US"),
	);
}
