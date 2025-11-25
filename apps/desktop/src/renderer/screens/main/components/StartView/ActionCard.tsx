import { LucideIcon } from "lucide-react";

interface ActionCardProps {
	icon: LucideIcon;
	label: string;
	onClick?: () => void;
	disabled?: boolean;
	isLoading?: boolean;
}

export function ActionCard({
	icon: Icon,
	label,
	onClick,
	disabled = false,
	isLoading = false,
}: ActionCardProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled || isLoading}
			className="flex-1 px-2.5 py-4 bg-[#201E1C] rounded-lg border border-[#2A2827] flex flex-col items-start gap-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#2A2827]"
		>
			<Icon
				className={`h-5 w-5 ${
					disabled
						? "text-muted-foreground/30"
						: "text-foreground"
				}`}
			/>
			<span
				className={`text-xs font-normal ${
					disabled
						? "text-muted-foreground/50"
						: "text-foreground"
				}`}
			>
				{isLoading ? "Opening..." : label}
			</span>
		</button>
	);
}
