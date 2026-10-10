import { useCallback, useMemo, useState } from "react";

const STORAGE_KEY = "admin.hiring.nav";

function readIds(): string[] {
	if (typeof window === "undefined") return [];
	try {
		const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

/** Remembers the list a candidate was opened from, so the page can step to its neighbours. */
export function useCandidateNav(candidateId?: string) {
	const [ids] = useState(readIds);

	const remember = useCallback((next: string[]) => {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	}, []);

	const position = useMemo(() => {
		const index = candidateId ? ids.indexOf(candidateId) : -1;
		if (index === -1) return null;
		return {
			index,
			total: ids.length,
			prevId: ids[index - 1] ?? null,
			nextId: ids[index + 1] ?? null,
		};
	}, [candidateId, ids]);

	return { remember, position };
}
