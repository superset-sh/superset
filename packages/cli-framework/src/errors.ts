export class CLIError extends Error {
	constructor(
		message: string,
		public suggestion?: string,
	) {
		super(message);
		this.name = "CLIError";
	}
}

export function suggestSimilar(
	input: string,
	candidates: string[],
	threshold = 3,
): string | undefined {
	let best: string | undefined;
	let bestDistance = threshold + 1;

	for (const candidate of candidates) {
		const distance = damerauLevenshtein(input, candidate);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = candidate;
		}
	}

	return best;
}

function damerauLevenshtein(a: string, b: string): number {
	const lenA = a.length;
	const lenB = b.length;
	const d: number[][] = Array.from({ length: lenA + 1 }, () =>
		Array<number>(lenB + 1).fill(0),
	);

	for (let i = 0; i <= lenA; i++) {
		const row = d[i];
		if (row) row[0] = i;
	}
	for (let j = 0; j <= lenB; j++) {
		const row = d[0];
		if (row) row[j] = j;
	}

	for (let i = 1; i <= lenA; i++) {
		for (let j = 1; j <= lenB; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			const del = (d[i - 1]?.[j] ?? 0) + 1;
			const ins = (d[i]?.[j - 1] ?? 0) + 1;
			const sub = (d[i - 1]?.[j - 1] ?? 0) + cost;
			let val = Math.min(del, ins, sub);

			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				val = Math.min(val, (d[i - 2]?.[j - 2] ?? 0) + cost);
			}

			const row = d[i];
			if (row) row[j] = val;
		}
	}

	return d[lenA]?.[lenB] ?? lenA + lenB;
}
