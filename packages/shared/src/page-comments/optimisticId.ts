export const OPTIMISTIC_ID_PREFIX = "optimistic-";

/**
 * Built from getRandomValues rather than randomUUID: Hermes ships neither, and
 * the mobile app polyfills only the former, so randomUUID here is undefined at
 * runtime on iOS. The value is a local placeholder key the server row replaces,
 * so it needs to be unique, not to be a UUID.
 */
export function optimisticId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	let hex = "";
	for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
	return `${OPTIMISTIC_ID_PREFIX}${hex}`;
}

export function isOptimisticId(id: string): boolean {
	return id.startsWith(OPTIMISTIC_ID_PREFIX);
}
