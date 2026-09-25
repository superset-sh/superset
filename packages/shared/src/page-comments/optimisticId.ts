export const OPTIMISTIC_ID_PREFIX = "optimistic-";

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
