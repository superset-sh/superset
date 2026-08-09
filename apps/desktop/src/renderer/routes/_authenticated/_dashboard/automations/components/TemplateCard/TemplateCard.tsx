import { Button } from "@superset/ui/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { LuX } from "react-icons/lu";
import type { AutomationTemplate } from "../../templates";

interface TemplateCardProps {
	template: AutomationTemplate;
	onSelect: (template: AutomationTemplate) => void;
	onDelete?: (template: AutomationTemplate) => void;
}

export function TemplateCard({
	template,
	onSelect,
	onDelete,
}: TemplateCardProps) {
	return (
		<Card
			role="button"
			tabIndex={0}
			onClick={() => onSelect(template)}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onSelect(template);
				}
			}}
			className="group relative py-4 cursor-pointer transition-all duration-150 hover:border-border/80 hover:bg-accent/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
		>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-sm">
					<span className="text-lg leading-none">{template.emoji}</span>
					{template.name}
				</CardTitle>
				<CardDescription className="line-clamp-2">
					{template.description}
				</CardDescription>
			</CardHeader>
			{onDelete && (
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={`Delete template "${template.name}"`}
					onClick={(event) => {
						event.stopPropagation();
						onDelete(template);
					}}
					className="absolute right-2 top-2 size-6 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
				>
					<LuX className="size-3.5" />
				</Button>
			)}
		</Card>
	);
}
