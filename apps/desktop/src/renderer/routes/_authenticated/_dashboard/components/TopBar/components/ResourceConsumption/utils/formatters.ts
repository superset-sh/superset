export function formatMemory(bytes: number): string {
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatCpu(percent: number): string {
	return `${percent.toFixed(1)}%`;
}

export function formatPercent(value: number): string {
	return `${value.toFixed(0)}%`;
}
