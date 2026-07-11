/** Pure stream URL builder kept independent of the React Native auth runtime. */
export function buildSessionStreamUrl(options: {
	relayUrl: string;
	organizationId: string;
	hostId: string;
	sessionId: string;
	token: string;
}): string {
	const relayUrl = options.relayUrl.replace(/\/$/, "").replace(/^http/, "ws");
	const routingKey = encodeURIComponent(
		`${options.organizationId}:${options.hostId}`,
	);
	return `${relayUrl}/hosts/${routingKey}/sessions/${encodeURIComponent(options.sessionId)}/stream?token=${encodeURIComponent(options.token)}`;
}
