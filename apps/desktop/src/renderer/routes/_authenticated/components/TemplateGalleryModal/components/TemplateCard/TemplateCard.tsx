import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuLoader } from "react-icons/lu";
import type { ProjectTemplate } from "../../templates";

interface TemplateCardProps {
	template: ProjectTemplate;
	cloning: boolean;
	disabled: boolean;
	onSelect: (template: ProjectTemplate) => void;
}

export function TemplateCard({
	template,
	cloning,
	disabled,
	onSelect,
}: TemplateCardProps) {
	const [imageFailed, setImageFailed] = useState(false);
	const available = !!template.repo;
	const Icon = template.icon;
	const bannerImage = template.banner;

	return (
		<button
			type="button"
			disabled={!available || disabled}
			onClick={() => onSelect(template)}
			className={cn(
				"flex flex-col overflow-hidden border border-border/50 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
				available && !disabled
					? "cursor-pointer hover:border-border"
					: "cursor-not-allowed opacity-60",
			)}
		>
			<div
				className={cn(
					"relative flex aspect-[2/1] items-center justify-center",
					template.bannerClassName,
				)}
			>
				{bannerImage && !imageFailed ? (
					<img
						src={bannerImage}
						alt=""
						className="absolute inset-0 size-full object-cover"
						onError={() => setImageFailed(true)}
					/>
				) : (
					<Icon className="size-7" />
				)}
				{cloning && (
					<div className="absolute inset-0 flex items-center justify-center bg-black/40">
						<LuLoader className="size-6 animate-spin text-white" />
					</div>
				)}
			</div>
			<div className="flex flex-col gap-0.5 p-3">
				<span className="text-sm font-medium text-foreground">
					{template.name}
				</span>
				<span className="line-clamp-2 text-xs text-muted-foreground">
					{available ? template.description : "Coming soon"}
				</span>
			</div>
		</button>
	);
}
