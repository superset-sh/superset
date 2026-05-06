import { Fragment } from "react";
import {
	AUTOMATION_TEMPLATE_CATEGORIES,
	type AutomationTemplate,
} from "../../templates";
import { TemplateCard } from "../TemplateCard";

interface AutomationsEmptyStateProps {
	onSelectTemplate: (template: AutomationTemplate) => void;
}

export function AutomationsEmptyState({
	onSelectTemplate,
}: AutomationsEmptyStateProps) {
	return (
		<div className="mx-auto max-w-5xl flex flex-col gap-8">
			{AUTOMATION_TEMPLATE_CATEGORIES.map((category) => (
				<Fragment key={category.id}>
					<section className="flex flex-col gap-3">
						<h2 className="text-sm font-medium">{category.label}</h2>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
							{category.templates.map((template) => (
								<TemplateCard
									key={template.id}
									template={template}
									onSelect={onSelectTemplate}
								/>
							))}
						</div>
					</section>
				</Fragment>
			))}
		</div>
	);
}
