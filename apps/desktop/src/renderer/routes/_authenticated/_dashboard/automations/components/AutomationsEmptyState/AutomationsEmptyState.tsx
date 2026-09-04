import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { LuSparkles } from "react-icons/lu";
import {
	type AutomationTemplate,
	ONBOARDING_SUGGESTIONS,
} from "../../templates";
import { TemplateCard } from "../TemplateCard";

const PLACEHOLDER_COUNT = 4;
const PLACEHOLDER_INTERVAL_MS = 5000;

interface AutomationsEmptyStateProps {
	onSelectTemplate: (template: AutomationTemplate) => void;
	/** Opens an agent session seeded to create an automation interactively. */
	onCreateWithAgent: () => void;
}

export function AutomationsEmptyState({
	onSelectTemplate,
	onCreateWithAgent,
}: AutomationsEmptyStateProps) {
	const { t } = useLingui();
	// Concrete, typeable examples (Cursor's rotating-placeholder pattern).
	// See plans/automations-onboarding.md.
	const placeholders = [
		t({
			message:
				"Every weekday at 9am, triage new GitHub issues and draft replies for my review",
		}),
		t({
			message: "Summarize failed CI runs every morning before standup",
		}),
		t({
			message:
				"Every Friday at 4pm, draft release notes from this week's merged PRs",
		}),
		t({
			message: "Nightly at 2am, find one small bug, fix it, and open a PR",
		}),
	];
	const [placeholderIndex, setPlaceholderIndex] = useState(0);
	useEffect(() => {
		const id = setInterval(
			() => setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_COUNT),
			PLACEHOLDER_INTERVAL_MS,
		);
		return () => clearInterval(id);
	}, []);

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-10 pb-10">
			<div className="flex w-full flex-col items-center gap-3 text-center">
				<h2 className="text-lg font-semibold tracking-tight">
					<Trans>What should run on a schedule?</Trans>
				</h2>
				{/* Opens an agent session that asks what to automate and creates it
				    via the superset:automate skill / CLI. Swaps to the inline NL
				    chat input in Phase 2. */}
				<button
					type="button"
					onClick={onCreateWithAgent}
					aria-label={t({
						message: "Create an automation with an agent",
					})}
					className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3.5 text-left transition-colors hover:border-border/80 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
				>
					<LuSparkles className="size-4 shrink-0 text-muted-foreground" />
					{/* Rotating examples are decorative; the stable name is on the button. */}
					<span
						key={placeholderIndex}
						aria-hidden="true"
						className="min-w-0 truncate text-sm text-muted-foreground animate-in fade-in duration-300"
					>
						{placeholders[placeholderIndex]}
					</span>
				</button>
				<p className="text-xs text-muted-foreground">
					<Trans>
						Runs land in a workspace. Review the diff, merge what's good.
					</Trans>
				</p>
			</div>

			<div className="flex w-full flex-col gap-3">
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					<Trans>Suggested</Trans>
				</h3>
				<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
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
