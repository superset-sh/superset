import { githubHandle } from "../src/router/hiring/github-handle";

const DAYS = /^(\d+)d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function localIsoDate(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** `7d`, `tomorrow`, a weekday (`tue`, `tuesday`: the next one after today) or `2026-10-20` → a local `YYYY-MM-DD`. */
export function parseFollowUp(value: string, now = new Date()): string {
	const input = value.trim().toLowerCase();
	if (ISO_DATE.test(input)) return input;
	const date = new Date(now);
	const days = DAYS.exec(input)?.[1];
	const weekday = WEEKDAYS.indexOf(input.slice(0, 3));
	if (days) {
		date.setDate(date.getDate() + Number(days));
	} else if (input === "tomorrow") {
		date.setDate(date.getDate() + 1);
	} else if (weekday !== -1 && input.length >= 3) {
		date.setDate(date.getDate() + (((weekday - date.getDay() + 6) % 7) + 1));
	} else {
		throw new Error(
			`Follow-up must look like 7d, tomorrow, tue or 2026-10-20, got "${value}"`,
		);
	}
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

/** The application to act on: the active one, else the first (most recently updated) row. */
function primaryRows<T extends CandidateMatch & { outcome: string }>(
	rows: T[],
): T[] {
	const byCandidate = new Map<string, T>();
	for (const row of rows) {
		const current = byCandidate.get(row.candidateId);
		if (
			!current ||
			(current.outcome !== "active" && row.outcome === "active")
		) {
			byCandidate.set(row.candidateId, row);
		}
	}
	return [...byCandidate.values()];
}

/** An id, an email or a GitHub handle picks one candidate; a name must match exactly, or as the only partial match. */
export function pickCandidate<T extends CandidateMatch & { outcome: string }>(
	query: string,
	rows: T[],
): T {
	const needle = query.trim().toLowerCase();
	const handle = githubHandle(query);
	const unique = primaryRows(rows);
	const exact = unique.filter(
		(row) =>
			row.candidateId === query ||
			row.email?.toLowerCase() === needle ||
			row.name.toLowerCase() === needle ||
			(handle !== null &&
				row.githubUrl !== null &&
				githubHandle(row.githubUrl) === handle),
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
