import { useLingui } from "@lingui/react/macro";
import type {
	ComposerMentionEntry,
	ComposerMentionProvider,
} from "@superset/chat-ui/PromptInput";
import Fuse from "fuse.js";
import { useMemo } from "react";
import { useIsDarkTheme } from "renderer/assets/app-icons/preset-icons";
import { PluginIcon } from "renderer/components/PluginIcon";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useTaskTracker } from "renderer/hooks/useTaskTracker";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { StatusType } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { TASK_PICKER_INPUT } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/hooks/useTasksData";
import { linkedIssueFromLinear } from "renderer/routes/_authenticated/utils/linkedIssueFromLinear";
import type { LinkedIssue } from "renderer/stores/new-workspace-draft";
import {
	linkedIssueChip,
	linkedRefFromText,
} from "../../utils/linkedContextChips";

const MAX_RESULTS = 20;

function isClosedStatus(type: StatusType | undefined): boolean {
	return type === "completed" || type === "canceled";
}

/** The organization's tracker — its Superset tasks or its Linear issues — as @-mentions. */
export function useTrackerMentionProvider(): ComposerMentionProvider | null {
	const { t } = useLingui();
	const organizationId = useActiveOrganizationId();
	const taskTracker = useTaskTracker();
	const cloudUtils = cloudTrpc.useUtils();
	const isDark = useIsDarkTheme();

	return useMemo(() => {
		const entry = (
			issue: LinkedIssue,
			pluginName: "linear" | "superset",
		): ComposerMentionEntry => ({
			id: issue.taskId ?? issue.slug,
			label: issue.slug,
			description: issue.title,
			icon: <PluginIcon className="size-4" pluginName={pluginName} />,
			select: (ctx) => ctx.insertChip(linkedIssueChip(issue, isDark)),
		});
		if (taskTracker === "linear" && organizationId) {
			return {
				id: "linear-issues",
				title: t({ message: "Linear issues" }),
				priority: 3,
				source: {
					kind: "search",
					emptyState: t({ message: "No matching Linear issues" }),
					search: async (query) => {
						// A pasted issue link resolves to that one issue.
						const ref = linkedRefFromText(query);
						if (ref && ref.kind !== "linear") return [];
						const search = ref ? ref.identifier : query || null;
						const { issues } = await cloudUtils.integration.linear.issues.fetch(
							{
								organizationId,
								status: ref ? "all" : "open",
								assignee: search ? null : "me",
								search,
							},
						);
						return issues
							.filter((issue) => !ref || issue.identifier === ref.identifier)
							.map((issue) => entry(linkedIssueFromLinear(issue), "linear"));
					},
				},
			};
		}
		if (taskTracker === "superset") {
			return {
				id: "tasks",
				title: t({ message: "Tasks" }),
				priority: 3,
				source: {
					kind: "search",
					emptyState: t({ message: "No matching tasks" }),
					search: async (query) => {
						const [page, statuses] = await Promise.all([
							cloudUtils.task.listPage.fetch(TASK_PICKER_INPUT),
							cloudUtils.task.statuses.list.fetch(),
						]);
						const closed = new Set(
							statuses
								.filter((status) => isClosedStatus(status.type as StatusType))
								.map((status) => status.id),
						);
						const open = page.items
							.map(({ task }) => task)
							.filter((task) => !task.statusId || !closed.has(task.statusId));
						const matches = query
							? new Fuse(open, {
									keys: [
										{ name: "slug", weight: 3 },
										{ name: "title", weight: 2 },
									],
									threshold: 0.4,
									ignoreLocation: true,
								})
									.search(query, { limit: MAX_RESULTS })
									.map((result) => result.item)
							: [...open]
									.sort(
										(a, b) =>
											new Date(b.updatedAt).getTime() -
											new Date(a.updatedAt).getTime(),
									)
									.slice(0, MAX_RESULTS);
						return matches.map((task) =>
							entry(
								{
									slug: task.slug,
									title: task.title,
									source: "internal",
									taskId: task.id,
									branch: task.branch ?? undefined,
								},
								"superset",
							),
						);
					},
				},
			};
		}
		return null;
	}, [cloudUtils, isDark, organizationId, t, taskTracker]);
}
