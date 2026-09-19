interface SessionReadError {
	status?: number;
}

interface SessionRead {
	hasUser: boolean;
	error: SessionReadError | null | undefined;
	timedOut: boolean;
}

// 401 and 403 are the server answering; everything else here is the server
// not being reachable, or not being well.
const isServerUnreachable = (error: SessionReadError): boolean =>
	error.status === undefined ||
	error.status === 0 ||
	error.status === 408 ||
	error.status === 429 ||
	error.status >= 500;

/**
 * Only the server ends a session. A read that came back empty with no error
 * is the server saying so; a read that failed or never came back says nothing.
 */
export function shouldBootFromSavedSession({
	hasUser,
	error,
	timedOut,
}: SessionRead): boolean {
	if (hasUser) return false;
	if (error) return isServerUnreachable(error);
	return timedOut;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

interface SessionLike {
	user: { id: string };
	session: Record<string, unknown>;
}

export function serializeSessionSnapshot(session: SessionLike): string {
	const { token: _token, ...sessionWithoutToken } = session.session;
	return JSON.stringify({ ...session, session: sessionWithoutToken });
}

export function parseSessionSnapshot(
	snapshot: string | null | undefined,
	token: string,
): SessionLike | null {
	if (!snapshot) return null;
	try {
		const parsed: unknown = JSON.parse(snapshot, (_key, value) =>
			typeof value === "string" && ISO_DATE.test(value)
				? new Date(value)
				: value,
		);
		if (!parsed || typeof parsed !== "object") return null;
		const candidate = parsed as Partial<SessionLike>;
		if (
			!candidate.user ||
			typeof candidate.user.id !== "string" ||
			!candidate.session ||
			typeof candidate.session !== "object"
		) {
			return null;
		}
		return {
			...candidate,
			user: candidate.user,
			session: { ...candidate.session, token },
		};
	} catch {
		return null;
	}
}
