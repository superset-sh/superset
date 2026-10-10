const DAYS = /^(\d+)d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function localIsoDate(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

/** `7d` or `2026-10-20` → a local `YYYY-MM-DD`. */
export function parseFollowUp(value: string, now = new Date()): string {
	if (ISO_DATE.test(value)) return value;
	const days = DAYS.exec(value)?.[1];
	if (!days)
		throw new Error(
			`Follow-up must look like 7d or 2026-10-20, got "${value}"`,
		);
	const date = new Date(now);
	date.setDate(date.getDate() + Number(days));
	return localIsoDate(date);
}

export function todayLocal(now = new Date()): string {
	return localIsoDate(now);
}

interface CandidateMatch {
	candidateId: string;
	name: string;
	email: string | null;
	githubUrl: string | null;
}

/** An id, an email or a GitHub handle picks one candidate; a name must match exactly one. */
export function pickCandidate<T extends CandidateMatch>(
	query: string,
	rows: T[],
): T {
	const needle = query.trim().toLowerCase();
	const unique = [
		...new Map(rows.map((row) => [row.candidateId, row])).values(),
	];
	const exact = unique.filter(
		(row) =>
			row.candidateId === query ||
			row.email?.toLowerCase() === needle ||
			row.githubUrl?.toLowerCase().replace(/\/+$/, "").endsWith(`/${needle}`),
	);
	const matches =
		exact.length > 0
			? exact
			: unique.filter((row) => row.name.toLowerCase().includes(needle));
	if (matches.length === 1 && matches[0]) return matches[0];
	if (matches.length === 0) throw new Error(`No candidate matches "${query}"`);
	throw new Error(
		`"${query}" matches ${matches.length} candidates: ${matches.map((row) => row.name).join(", ")}. Use an email or id.`,
	);
}
