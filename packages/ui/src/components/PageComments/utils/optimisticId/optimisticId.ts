export const OPTIMISTIC_ID_PREFIX = "optimistic-";

export function optimisticId(): string {
	return `${OPTIMISTIC_ID_PREFIX}${crypto.randomUUID()}`;
}

export function isOptimisticId(id: string): boolean {
	return id.startsWith(OPTIMISTIC_ID_PREFIX);
}
