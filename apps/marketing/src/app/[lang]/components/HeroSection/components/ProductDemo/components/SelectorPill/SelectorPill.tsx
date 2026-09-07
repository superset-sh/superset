"use client";

interface SelectorPillProps {
	label: string;
	active?: boolean;
	onSelect?: () => void;
}

export function SelectorPill({
	label,
	active = false,
	onSelect,
}: SelectorPillProps) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onSelect}
			className={`group relative flex items-center shrink-0 lg:w-full min-h-11 px-4 py-2 lg:py-2.5 text-left text-xs sm:text-sm whitespace-nowrap cursor-pointer transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
				active
					? "bg-brand/10 text-foreground"
					: "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
			}`}
		>
			{/* Active marker: ember bar on the left edge, same as the app's sidebar */}
			<span
				className={`absolute left-0 top-1/2 -translate-y-1/2 w-[2px] bg-brand/80 transition-all duration-200 ease-out ${
					active ? "h-2/5 opacity-100" : "h-0 opacity-0"
				}`}
			/>
			{label}
		</button>
	);
}
