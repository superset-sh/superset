"use client";

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
			title="AI · Agent activity"
			description="Structured progress: chain of thought, tasks, plans"
		>
			<ComponentCard
				title="Chain of Thought"
				importPath="@superset/ui/ai-elements/chain-of-thought"
				span
			>
				<ChainOfThought className="w-full" defaultOpen>
					<ChainOfThoughtHeader>
						Planning the tooltip refactor
					</ChainOfThoughtHeader>
					<ChainOfThoughtContent>
						<ChainOfThoughtStep
							icon={SearchIcon}
							label="Searched for tooltip overrides"
							description="55 call sites pass showArrow={false}"
							status="complete"
						>
							<ChainOfThoughtSearchResults>
								<ChainOfThoughtSearchResult>
									PresetsBar.tsx
								</ChainOfThoughtSearchResult>
								<ChainOfThoughtSearchResult>
									HotkeyTooltip.tsx
								</ChainOfThoughtSearchResult>
								<ChainOfThoughtSearchResult>
									PaneHeaderActions.tsx
								</ChainOfThoughtSearchResult>
							</ChainOfThoughtSearchResults>
						</ChainOfThoughtStep>
						<ChainOfThoughtStep
							icon={FileSearchIcon}
							label="Compared against the default style"
							status="complete"
						/>
						<ChainOfThoughtStep
							icon={WrenchIcon}
							label="Baking the chip style into tooltip.tsx"
							status="active"
						/>
					</ChainOfThoughtContent>
				</ChainOfThought>
			</ComponentCard>

			<ComponentCard title="Task" importPath="@superset/ui/ai-elements/task">
				<Task className="w-full" defaultOpen>
					<TaskTrigger title="Searching for Kbd usages" />
					<TaskContent>
						<TaskItem>
							Read{" "}
							<TaskItemFile>packages/ui/src/components/ui/kbd.tsx</TaskItemFile>
						</TaskItem>
						<TaskItem>
							Grepped <TaskItemFile>apps/desktop/src/renderer</TaskItemFile>
						</TaskItem>
						<TaskItem>Found 12 tooltip call sites</TaskItem>
					</TaskContent>
				</Task>
			</ComponentCard>

			<ComponentCard title="Plan" importPath="@superset/ui/ai-elements/plan">
				<Plan className="w-full" defaultOpen>
					<PlanHeader>
						<PlanTitle>Standardize tooltip styling</PlanTitle>
						<PlanDescription>
							Three steps · touches packages/ui and apps/desktop
						</PlanDescription>
					</PlanHeader>
					<PlanContent>
						<ol className="list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
							<li>Make the chip style the TooltipContent default</li>
							<li>Strip redundant overrides at call sites</li>
							<li>Verify Kbd stays visible inside tooltips</li>
						</ol>
					</PlanContent>
				</Plan>
			</ComponentCard>
		</ShowcaseSection>
	);
}
