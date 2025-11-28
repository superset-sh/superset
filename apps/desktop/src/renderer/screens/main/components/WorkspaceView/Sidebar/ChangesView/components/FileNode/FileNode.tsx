import { useDiffColors } from "renderer/hooks/useDiffColors";
import type { FileNodeProps } from "../../types";

/**
 * Status badge color mapping
 */
function getStatusColor(
	status: string,
	colors: ReturnType<typeof useDiffColors>,
): string {
	switch (status) {
		case "A":
		case "?":
			return colors.addedIndicator;
		case "D":
			return colors.deletedIndicator;
		case "M":
		case "U":
			return "#d29922"; // Yellow for modified
		case "R":
		case "C":
			return "#58a6ff"; // Blue for renamed/copied
		default:
			return colors.lineNumber;
	}
}

/**
 * Status badge label
 */
function getStatusLabel(status: string): string {
	switch (status) {
		case "A":
			return "A";
		case "M":
			return "M";
		case "D":
			return "D";
		case "R":
			return "R";
		case "C":
			return "C";
		case "U":
			return "U";
		case "?":
			return "?";
		default:
			return "?";
	}
}

export function FileNode({ file, depth, onClick }: FileNodeProps) {
	const colors = useDiffColors();
	const statusColor = getStatusColor(file.status, colors);

	return (
		<button
			type="button"
			onClick={onClick}
			className="w-full text-start px-3 py-1.5 rounded-md flex items-center gap-2 text-sm transition-colors duration-100 hover:bg-accent hover:text-accent-foreground"
			style={{ paddingLeft: `${depth * 12 + 12}px` }}
		>
			<span
				className="text-xs font-mono w-4 shrink-0 text-center font-semibold"
				style={{ color: statusColor }}
			>
				{getStatusLabel(file.status)}
			</span>
			<span className="truncate flex-1">{file.path.split("/").pop()}</span>
			{(file.additions > 0 || file.deletions > 0) && (
				<span className="text-xs text-muted-foreground shrink-0">
					{file.additions > 0 && (
						<span style={{ color: colors.addedIndicator }}>+{file.additions}</span>
					)}
					{file.additions > 0 && file.deletions > 0 && " "}
					{file.deletions > 0 && (
						<span style={{ color: colors.deletedIndicator }}>-{file.deletions}</span>
					)}
				</span>
			)}
		</button>
	);
}
