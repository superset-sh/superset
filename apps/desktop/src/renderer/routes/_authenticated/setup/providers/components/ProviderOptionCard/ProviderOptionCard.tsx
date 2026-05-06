import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuCheck } from "react-icons/lu";

interface ProviderOptionCardProps {
	icon: ReactNode;
	title: string;
	description: string;
	recommended?: boolean;
	selected: boolean;
	onSelect: () => void;
}

export function ProviderOptionCard({
	icon,
	title,
	description,
	recommended,
	selected,
	onSelect,
}: ProviderOptionCardProps) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"relative flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors",
				selected
					? "border-[rgba(255,136,70,0.6)] bg-[rgba(255,91,0,0.08)]"
					: "border-[#2a2827] bg-[#201e1c] hover:bg-[#2a2827]",
			)}
		>
			<div className="size-11 shrink-0 overflow-hidden rounded-lg">{icon}</div>
			<div className="min-w-0 flex-1 space-y-0.5">
				<div className="flex items-center gap-2">
					<span className="text-[13px] font-semibold text-[#eae8e6]">
						{title}
					</span>
					{recommended && (
						<span className="rounded-md bg-[#151110] px-1.5 py-0.5 text-[10px] font-medium text-[#a8a5a3]">
							Recommended
						</span>
					)}
				</div>
				<p className="text-[11px] text-[#a8a5a3]">{description}</p>
			</div>
			{selected && (
				<div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[rgba(255,91,0,0.8)] text-white">
					<LuCheck className="size-3.5" strokeWidth={3} />
				</div>
			)}
		</button>
	);
}
