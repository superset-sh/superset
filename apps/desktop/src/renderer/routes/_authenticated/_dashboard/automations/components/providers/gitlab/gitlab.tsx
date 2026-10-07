import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import {
	gitlabEventFilters,
	isEmptyScope,
} from "@superset/shared/automation-triggers";
import { useEffect } from "react";
import { FaGitlab } from "react-icons/fa";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import type { SentenceContext, TriggerProvider } from "../types";
import { GITLAB_EVENTS, GITLAB_MENU, type GitlabConfig } from "./grammar";

function GitlabSentence({
	config,
	context: { set, mark, options, state, disabled },
}: {
	config: GitlabConfig;
	context: SentenceContext;
}) {
	const { _: translate } = useLingui();
	const filters = gitlabEventFilters(config.event);
	useEffect(() => {
		if (!filters.branches && config.branches.mode !== "any")
			set({ branches: { mode: "any" } });
		if (!filters.labels && config.labels.mode !== "any")
			set({ labels: { mode: "any" } });
	}, [
		filters.branches,
		filters.labels,
		config.branches.mode,
		config.labels.mode,
		set,
	]);
	return (
		<>
			<span className="text-[13px] text-muted-foreground">
				{translate(GITLAB_EVENTS[config.event])}
			</span>
			<ScopeChip
				scope={config.projects}
				onChange={(projects) => set({ projects })}
				className={mark("projects")}
				options={options.gitlab?.projects ?? []}
				emptyLabel={translate(msg({ message: "Select projects" }))}
				anyLabel={translate(msg({ message: "Any project" }))}
				allowAny={false}
				state={state}
				disabled={disabled}
			/>
			{filters.branches && (
				<ScopeChip
					scope={config.branches}
					onChange={(branches) =>
						set({
							branches: isEmptyScope(branches) ? { mode: "any" } : branches,
						})
					}
					options={options.gitlab?.branches ?? []}
					emptyLabel={translate(msg({ message: "Any branch" }))}
					anyLabel={translate(msg({ message: "Any branch" }))}
					allowCustom={{
						placeholder: translate(msg({ message: "Branch name" })),
					}}
					state={state}
					disabled={disabled}
				/>
			)}
			{filters.labels && (
				<ScopeChip
					scope={config.labels}
					onChange={(labels) =>
						set({ labels: isEmptyScope(labels) ? { mode: "any" } : labels })
					}
					options={options.gitlab?.labels ?? []}
					emptyLabel={translate(msg({ message: "Any label" }))}
					anyLabel={translate(msg({ message: "Any label" }))}
					allowCustom={{ placeholder: translate(msg({ message: "Label" })) }}
					state={state}
					disabled={disabled}
				/>
			)}
		</>
	);
}

export const gitlabProvider: TriggerProvider<GitlabConfig> = {
	kind: "gitlab",
	connectionProvider: "gitlab",
	optionGroup: "gitlab",
	label: "GitLab",
	icon: FaGitlab,
	menu: GITLAB_MENU,
	renderSentence: (config, context) => (
		<GitlabSentence config={config} context={context} />
	),
};
