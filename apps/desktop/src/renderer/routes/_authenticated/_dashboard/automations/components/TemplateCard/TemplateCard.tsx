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
			className="flex flex-col items-start gap-1 rounded-lg border border-border px-3.5 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
		>
			<span className="flex items-center gap-2 text-sm font-medium">
				<span className="text-base leading-none">{template.emoji}</span>
				{i18n._(template.name)}
			</span>
			<span className="line-clamp-3 text-xs text-muted-foreground">
				{i18n._(template.description)}
			</span>
		</button>
	);
}
