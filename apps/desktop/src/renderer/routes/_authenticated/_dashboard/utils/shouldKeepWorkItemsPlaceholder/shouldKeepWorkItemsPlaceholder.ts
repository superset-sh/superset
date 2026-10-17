/** `targetKey` names the host by id and its projects; the host URL is left
 *  out because its port can change between launches. */
export function shouldKeepWorkItemsPlaceholder(
	previousQueryKey: readonly unknown[] | undefined,
	targetKey: string | null,
): boolean {
	return previousQueryKey?.[2] === targetKey;
}
