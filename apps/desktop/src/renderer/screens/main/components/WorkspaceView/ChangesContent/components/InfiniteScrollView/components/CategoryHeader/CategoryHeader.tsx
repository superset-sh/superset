import { LuChevronDown, LuChevronRight } from "react-icons/lu";

interface CategoryHeaderProps {
	title: string;
	count: number;
	isExpanded: boolean;
	onToggle: () => void;
}

export function CategoryHeader({
	title,
	count,
	isExpanded,
	onToggle,
}: CategoryHeaderProps) {
	if (count === 0) return null;

	return (
		<button
			type="button"
			onClick={onToggle}
			className="flex items-center gap-2 px-4 py-2 w-full text-left hover:bg-muted transition-colors sticky top-0 z-20 border-b border-r border-border"
		>
			{isExpanded ? (
				<LuChevronDown className="size-4 text-muted-foreground" />
			) : (
				<LuChevronRight className="size-4 text-muted-foreground" />
			)}
			<span className="text-sm font-semibold">{title}</span>
			<span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
				{count}
			</span>
		</button>
	);
}
