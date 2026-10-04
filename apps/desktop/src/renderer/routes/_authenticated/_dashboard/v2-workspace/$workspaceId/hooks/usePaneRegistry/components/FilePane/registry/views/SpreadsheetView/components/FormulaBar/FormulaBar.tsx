import { TbMathFunction } from "react-icons/tb";
import type { GridCell } from "../../types";

interface FormulaBarProps {
	address: string;
	cell: GridCell | null | undefined;
}

export function FormulaBar({ address, cell }: FormulaBarProps) {
	const source = cell?.formula ?? cell?.value ?? cell?.text ?? "";
	const showResult = Boolean(cell && source !== cell.text && cell.text);

	return (
		<div className="flex h-7 shrink-0 items-center gap-3 border-border border-b px-2 text-xs">
			<span className="w-20 shrink-0 truncate font-mono text-muted-foreground">
				{address}
			</span>
			<TbMathFunction
				aria-hidden
				className="size-3.5 shrink-0 text-muted-foreground/70"
			/>
			<span className="min-w-0 cursor-text select-text truncate font-mono">
				{source}
			</span>
			{showResult && (
				<span className="min-w-0 max-w-[40%] shrink-0 cursor-text select-text truncate text-muted-foreground tabular-nums">
					{cell?.text}
				</span>
			)}
		</div>
	);
}
