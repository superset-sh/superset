const GUEST_ID_KEY = "superset.page-guest-id";

export function guestId(): string {
	try {
		const stored = localStorage.getItem(GUEST_ID_KEY);
		if (stored && /^[0-9a-f-]{36}$/.test(stored)) return stored;
		const id = crypto.randomUUID();
		localStorage.setItem(GUEST_ID_KEY, id);
		return id;
	} catch {
		return crypto.randomUUID();
	}
}
