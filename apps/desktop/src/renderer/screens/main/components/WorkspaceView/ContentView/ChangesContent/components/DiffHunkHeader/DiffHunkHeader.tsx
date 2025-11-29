import { memo } from "react";
import { useDiffColors } from "renderer/hooks/useDiffColors";

interface DiffHunkHeaderProps {
	header: string;
	style?: React.CSSProperties;
}

function DiffHunkHeaderComponent({ header, style }: DiffHunkHeaderProps) {
	const colors = useDiffColors();

	return (
		<div
			className="flex font-mono text-xs leading-6 select-none"
			style={{ backgroundColor: colors.hunkHeaderBg, ...style }}
		>
			<span className="w-12 shrink-0" />
			<span className="w-12 shrink-0" />
			<span className="w-6 shrink-0" />
			<span className="flex-1 px-2" style={{ color: colors.hunkHeaderText }}>
				{header}
			</span>
		</div>
	);
}

export const DiffHunkHeader = memo(DiffHunkHeaderComponent);
