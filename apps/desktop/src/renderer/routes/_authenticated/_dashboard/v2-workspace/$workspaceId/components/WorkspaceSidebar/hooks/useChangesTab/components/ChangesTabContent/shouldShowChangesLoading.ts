export function shouldShowChangesLoading(status: {
	data: unknown;
	isLoading: boolean;
}): boolean {
	return !status.data && status.isLoading;
}
