export function shouldKeepWorkItemsPlaceholder(
	previousQueryKey: readonly unknown[] | undefined,
	targetKey: string | null,
	hostUrl: string | null,
): boolean {
	return (
		previousQueryKey?.[2] === targetKey && previousQueryKey?.[3] === hostUrl
	);
}
