import { Trans } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { LuPlus, LuTimer } from "react-icons/lu";
import {
	type AutomationTemplate,
	ONBOARDING_SUGGESTIONS,
} from "../../templates";
import { TemplateCard } from "../TemplateCard";

interface AutomationsEmptyStateProps {
	onSelectTemplate: (template: AutomationTemplate) => void;
	onCreateWithAgent: () => void;
	isCreating: boolean;
	onCreateManually: () => void;
	isCreatingManually: boolean;
	/** The viewer's plan can't create one; the buttons open the paywall. */
	showProBadge?: boolean;
}
export function AutomationsEmptyState({
	onSelectTemplate,
	onCreateWithAgent,
	isCreating,
	onCreateManually,
	isCreatingManually,
	showProBadge = false,
}: AutomationsEmptyStateProps) {
	return (
		<div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-10 py-12">
			<div className="flex flex-col items-start gap-4">
				<div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
					<LuTimer className="size-5" />
				</div>
				<div className="space-y-2">
					<h2 className="flex items-center gap-2 font-semibold text-lg tracking-tight">
						<Trans>What should run on a schedule?</Trans>
						{showProBadge && (
							<Badge variant="default">
								<Trans>PRO</Trans>
							</Badge>
						)}
					</h2>
					<p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
						<Trans>
							Runs land in a workspace. Review the diff, merge what's good.
						</Trans>
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button size="sm" onClick={onCreateWithAgent} disabled={isCreating}>
						<LuPlus className="size-3.5" />
						<Trans>Create with AI</Trans>
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="text-muted-foreground"
						onClick={onCreateManually}
						disabled={isCreatingManually}
					>
						<Trans>New automation</Trans>
					</Button>
				</div>
			</div>
			<div className="space-y-2 border-t border-border/60 pt-6">
				<h3 className="mb-3 text-xs font-medium text-muted-foreground">
					<Trans>Suggested</Trans>
				</h3>
				<div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
					{ONBOARDING_SUGGESTIONS.map((template) => (
						<TemplateCard
							key={template.id}
							template={template}
							onSelect={onSelectTemplate}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
