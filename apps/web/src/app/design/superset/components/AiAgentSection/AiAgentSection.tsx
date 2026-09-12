"use client";

import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import {
	ChainOfThought,
	ChainOfThoughtContent,
	ChainOfThoughtHeader,
	ChainOfThoughtSearchResult,
	ChainOfThoughtSearchResults,
	ChainOfThoughtStep,
} from "@superset/ui/ai-elements/chain-of-thought";
import {
	Plan,
	PlanContent,
	PlanDescription,
	PlanHeader,
	PlanTitle,
} from "@superset/ui/ai-elements/plan";
import {
	Task,
	TaskContent,
	TaskItem,
	TaskItemFile,
	TaskTrigger,
} from "@superset/ui/ai-elements/task";
import { FileSearchIcon, SearchIcon, WrenchIcon } from "lucide-react";
import { ComponentCard } from "../../../components/ComponentCard";
import { ShowcaseSection } from "../../../components/ShowcaseSection";

export function AiAgentSection() {
	return (
		<ShowcaseSection
			id="ai-agent"
			index="04"
			title={i18n._(
				msg({
					message: "AI · Agent activity",
				}),
			)}
			description={i18n._(
				msg({
					message: "Structured progress: chain of thought, tasks, plans",
				}),
			)}
		>
			<ComponentCard
				title={i18n._(
					msg({
						message: "Chain of Thought",
					}),
				)}
				importPath="@superset/ui/ai-elements/chain-of-thought"
				span
			>
				<ChainOfThought className="w-full" defaultOpen>
					<ChainOfThoughtHeader>
						<Trans>Planning the tooltip refactor</Trans>
					</ChainOfThoughtHeader>
					<ChainOfThoughtContent>
						<ChainOfThoughtStep
							icon={SearchIcon}
							label={i18n._(
								msg({
									message: "Searched for tooltip overrides",
								}),
							)}
							description={i18n._({
								...msg({
									// The code fragment is a value, not part of the message:
									// ICU would read `{false}` as a placeholder and drop it.
									message: "55 call sites pass {code}",
								}),
								values: { code: "showArrow={false}" },
							})}
							status="complete"
						>
							<ChainOfThoughtSearchResults>
								<ChainOfThoughtSearchResult>
									<Trans>PresetsBar.tsx</Trans>
								</ChainOfThoughtSearchResult>
								<ChainOfThoughtSearchResult>
									<Trans>HotkeyTooltip.tsx</Trans>
								</ChainOfThoughtSearchResult>
								<ChainOfThoughtSearchResult>
									<Trans>PaneHeaderActions.tsx</Trans>
								</ChainOfThoughtSearchResult>
							</ChainOfThoughtSearchResults>
						</ChainOfThoughtStep>
						<ChainOfThoughtStep
							icon={FileSearchIcon}
							label={i18n._(
								msg({
									message: "Compared against the default style",
								}),
							)}
							status="complete"
						/>
						<ChainOfThoughtStep
							icon={WrenchIcon}
							label={i18n._(
								msg({
									message: "Baking the chip style into tooltip.tsx",
								}),
							)}
							status="active"
						/>
					</ChainOfThoughtContent>
				</ChainOfThought>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Task",
					}),
				)}
				importPath="@superset/ui/ai-elements/task"
			>
				<Task className="w-full" defaultOpen>
					<TaskTrigger
						title={i18n._(
							msg({
								message: "Searching for Kbd usages",
							}),
						)}
					/>
					<TaskContent>
						<TaskItem>
							<Trans>Read</Trans>{" "}
							<TaskItemFile>
								<Trans>packages/ui/src/components/ui/kbd.tsx</Trans>
							</TaskItemFile>
						</TaskItem>
						<TaskItem>
							<Trans>Grepped</Trans>{" "}
							<TaskItemFile>
								<Trans>apps/desktop/src/renderer</Trans>
							</TaskItemFile>
						</TaskItem>
						<TaskItem>
							<Trans>Found 12 tooltip call sites</Trans>
						</TaskItem>
					</TaskContent>
				</Task>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Plan",
					}),
				)}
				importPath="@superset/ui/ai-elements/plan"
			>
				<Plan className="w-full" defaultOpen>
					<PlanHeader>
						<PlanTitle>
							{i18n._(
								msg({
									message: "Standardize tooltip styling",
								}),
							)}
						</PlanTitle>
						<PlanDescription>
							{i18n._(
								msg({
									message: "Three steps · touches packages/ui and apps/desktop",
								}),
							)}
						</PlanDescription>
					</PlanHeader>
					<PlanContent>
						<ol className="list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
							<li>
								<Trans>Make the chip style the TooltipContent default</Trans>
							</li>
							<li>
								<Trans>Strip redundant overrides at call sites</Trans>
							</li>
							<li>
								<Trans>Verify Kbd stays visible inside tooltips</Trans>
							</li>
						</ol>
					</PlanContent>
				</Plan>
			</ComponentCard>
		</ShowcaseSection>
	);
}
