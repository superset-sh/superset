export const RESOURCE_MONITOR_REFETCH_INTERVAL_MS = 2_000;

export function shouldQueryResourceMonitor({
	enabled,
	open,
}: {
	enabled: boolean | undefined;
	open: boolean;
}): boolean {
	return enabled === true && open;
}

export function getResourceMonitorRefetchInterval(
	open: boolean,
): number | false {
	return open ? RESOURCE_MONITOR_REFETCH_INTERVAL_MS : false;
}
