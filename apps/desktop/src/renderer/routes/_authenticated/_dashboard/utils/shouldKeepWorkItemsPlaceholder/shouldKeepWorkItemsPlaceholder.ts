export function shouldKeepWorkItemsPlaceholder(
	previousQueryKey: readonly unknown[] | undefined,
	projectId: string | null,
	hostUrl: string | null,
): boolean {
	return (
		previousQueryKey?.[2] === projectId && previousQueryKey?.[3] === hostUrl
	);
}
