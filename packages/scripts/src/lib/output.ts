const ESC = "\x1b[";

export const bold = (s: string) => `${ESC}1m${s}${ESC}0m`;
export const dim = (s: string) => `${ESC}2m${s}${ESC}0m`;
export const green = (s: string) => `${ESC}32m${s}${ESC}0m`;
export const red = (s: string) => `${ESC}31m${s}${ESC}0m`;
export const cyan = (s: string) => `${ESC}36m${s}${ESC}0m`;
export const yellow = (s: string) => `${ESC}33m${s}${ESC}0m`;

export function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days}d ago`;
	if (hours > 0) return `${hours}h ago`;
	if (minutes > 0) return `${minutes}m ago`;
	return "just now";
}

export function printTable(rows: string[][]): void {
	if (rows.length === 0) return;

	const firstRow = rows[0];
	if (!firstRow) return;

	const colWidths = firstRow.map((_, colIdx) =>
		Math.max(...rows.map((row) => (row[colIdx] ?? "").length)),
	);

	for (const row of rows) {
		const line = row
			.map((cell, i) => (cell ?? "").padEnd((colWidths[i] ?? 0) + 2))
			.join("")
			.trimEnd();
		console.log(`  ${line}`);
	}
}

export function error(message: string): void {
	console.error(`${red("error:")} ${message}`);
}

export function info(message: string): void {
	console.log(message);
}
