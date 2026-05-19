export const RESOURCE_MONITOR_REFETCH_INTERVAL_MS = 2_000;

export function shouldQueryResourceMonitor({
	enabled,
	open,
	metadataReady,
}: {
	enabled: boolean | undefined;
	open: boolean;
	metadataReady: boolean;
}): boolean {
	return enabled === true && open && metadataReady;
}

export function getResourceMonitorRefetchInterval(
	open: boolean,
): number | false {
	return open ? RESOURCE_MONITOR_REFETCH_INTERVAL_MS : false;
}
