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
		<div className="mx-auto flex max-w-5xl flex-col gap-8">
			<div className="flex flex-col gap-1">
				<h2 className="text-base font-semibold tracking-tight">
					Start from a template
				</h2>
				<p className="text-sm text-muted-foreground">
					Run an agent on a schedule to automate work.
				</p>
			</div>
			{AUTOMATION_TEMPLATE_CATEGORIES.map((category) => (
				<Fragment key={category.id}>
					<section className="flex flex-col gap-3">
						<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
							{category.label}
						</h3>
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
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
