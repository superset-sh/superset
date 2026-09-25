import { i18n } from "@superset/i18n";
import type { AutomationTemplate } from "../../templates";

interface TemplateCardProps {
	template: AutomationTemplate;
	onSelect: (template: AutomationTemplate) => void;
}

export function TemplateCard({ template, onSelect }: TemplateCardProps) {
	return (
		<button
			type="button"
			onClick={() => onSelect(template)}
			className="flex flex-col items-start gap-1 rounded-md px-3 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
		>
			<span className="flex items-center gap-2 text-sm font-medium">
				{i18n._(template.name)}
			</span>
			<span className="line-clamp-2 text-xs text-muted-foreground">
				{i18n._(template.description)}
			</span>
		</button>
	);
}
