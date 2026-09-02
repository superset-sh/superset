"use client";

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
			title={i18n._({
				id: "web.design.aiAgentSection.aiAgentActivity",
				message: "AI · Agent activity",
			})}
			description={i18n._({
				id: "web.design.aiAgentSection.structuredProgressChainOfThought",
				message: "Structured progress: chain of thought, tasks, plans",
			})}
		>
			<ComponentCard
				title={i18n._({
					id: "web.design.aiAgentSection.chainOfThought",
					message: "Chain of Thought",
				})}
				importPath="@superset/ui/ai-elements/chain-of-thought"
				span
			>
				<ChainOfThought className="w-full" defaultOpen>
					<ChainOfThoughtHeader>
						<Trans id="web.design.aiAgentSection.planningTheTooltipRefactor">
							Planning the tooltip refactor
						</Trans>
					</ChainOfThoughtHeader>
					<ChainOfThoughtContent>
						<ChainOfThoughtStep
							icon={SearchIcon}
							label={i18n._({
								id: "web.design.aiAgentSection.searchedForTooltipOverrides",
								message: "Searched for tooltip overrides",
							})}
							description={i18n._({
								id: "web.design.aiAgentSection.55CallSitesPassShowarrow",
								// The code fragment is a value, not part of the message:
								// ICU would read `{false}` as a placeholder and drop it.
								message: "55 call sites pass {code}",
								values: { code: "showArrow={false}" },
							})}
							status="complete"
						>
							<ChainOfThoughtSearchResults>
								<ChainOfThoughtSearchResult>
									<Trans id="web.design.aiAgentSection.presetsbarTsx">
										PresetsBar.tsx
									</Trans>
								</ChainOfThoughtSearchResult>
								<ChainOfThoughtSearchResult>
									<Trans id="web.design.aiAgentSection.hotkeytooltipTsx">
										HotkeyTooltip.tsx
									</Trans>
								</ChainOfThoughtSearchResult>
								<ChainOfThoughtSearchResult>
									<Trans id="web.design.aiAgentSection.paneheaderactionsTsx">
										PaneHeaderActions.tsx
									</Trans>
								</ChainOfThoughtSearchResult>
							</ChainOfThoughtSearchResults>
						</ChainOfThoughtStep>
						<ChainOfThoughtStep
							icon={FileSearchIcon}
							label={i18n._({
								id: "web.design.aiAgentSection.comparedAgainstTheDefaultStyle",
								message: "Compared against the default style",
							})}
							status="complete"
						/>
						<ChainOfThoughtStep
							icon={WrenchIcon}
							label={i18n._({
								id: "web.design.aiAgentSection.bakingTheChipStyleInto",
								message: "Baking the chip style into tooltip.tsx",
							})}
							status="active"
						/>
					</ChainOfThoughtContent>
				</ChainOfThought>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.aiAgentSection.task",
					message: "Task",
				})}
				importPath="@superset/ui/ai-elements/task"
			>
				<Task className="w-full" defaultOpen>
					<TaskTrigger
						title={i18n._({
							id: "web.design.aiAgentSection.searchingForKbdUsages",
							message: "Searching for Kbd usages",
						})}
					/>
					<TaskContent>
						<TaskItem>
							<Trans id="web.design.aiAgentSection.read">Read</Trans>{" "}
							<TaskItemFile>
								<Trans id="web.design.aiAgentSection.packagesUiSrcComponentsUi">
									packages/ui/src/components/ui/kbd.tsx
								</Trans>
							</TaskItemFile>
						</TaskItem>
						<TaskItem>
							<Trans id="web.design.aiAgentSection.grepped">Grepped</Trans>{" "}
							<TaskItemFile>
								<Trans id="web.design.aiAgentSection.appsDesktopSrcRenderer">
									apps/desktop/src/renderer
								</Trans>
							</TaskItemFile>
						</TaskItem>
						<TaskItem>
							<Trans id="web.design.aiAgentSection.found12TooltipCallSites">
								Found 12 tooltip call sites
							</Trans>
						</TaskItem>
					</TaskContent>
				</Task>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.aiAgentSection.plan",
					message: "Plan",
				})}
				importPath="@superset/ui/ai-elements/plan"
			>
				<Plan className="w-full" defaultOpen>
					<PlanHeader>
						<PlanTitle>
							{i18n._({
								id: "web.design.aiAgentSection.standardizeTooltipStyling",
								message: "Standardize tooltip styling",
							})}
						</PlanTitle>
						<PlanDescription>
							{i18n._({
								id: "web.design.aiAgentSection.threeStepsTouchesPackagesUi",
								message: "Three steps · touches packages/ui and apps/desktop",
							})}
						</PlanDescription>
					</PlanHeader>
					<PlanContent>
						<ol className="list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
							<li>
								<Trans id="web.design.aiAgentSection.makeTheChipStyleThe">
									Make the chip style the TooltipContent default
								</Trans>
							</li>
							<li>
								<Trans id="web.design.aiAgentSection.stripRedundantOverridesAtCall">
									Strip redundant overrides at call sites
								</Trans>
							</li>
							<li>
								<Trans id="web.design.aiAgentSection.verifyKbdStaysVisibleInside">
									Verify Kbd stays visible inside tooltips
								</Trans>
							</li>
						</ol>
					</PlanContent>
				</Plan>
			</ComponentCard>
		</ShowcaseSection>
	);
}
