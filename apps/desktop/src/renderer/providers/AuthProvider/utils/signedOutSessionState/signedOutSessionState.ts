interface SessionState {
	data: unknown;
	error: unknown;
	isPending: boolean;
	isRefetching: boolean;
}

export function signedOutSessionState<State extends SessionState>(
	current: State,
): State {
	return {
		...current,
		data: null,
		error: null,
		isPending: false,
		isRefetching: false,
	};
}
