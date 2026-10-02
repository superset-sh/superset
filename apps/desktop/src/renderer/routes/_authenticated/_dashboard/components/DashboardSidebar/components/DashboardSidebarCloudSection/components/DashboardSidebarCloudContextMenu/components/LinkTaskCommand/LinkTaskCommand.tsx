import { Trans, useLingui } from "@lingui/react/macro";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { type KeyboardEvent, useDeferredValue, useMemo, useState } from "react";
import { useTaskDisplayId } from "renderer/hooks/useTaskDisplayId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CloudTaskIcon } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskIcon";
import type { CloudTask } from "renderer/routes/_authenticated/_dashboard/components/CloudTaskRow";

const RESULT_LIMIT = 20;

interface LinkTaskCommandProps {
	linkedTaskIds: ReadonlySet<string>;
	onToggle: (task: CloudTask, isLinked: boolean) => void;
	onKeyDown?: (event: KeyboardEvent) => void;
}

export function LinkTaskCommand({
	linkedTaskIds,
	onToggle,
	onKeyDown,
}: LinkTaskCommandProps) {
	const taskDisplayId = useTaskDisplayId();
	const { t } = useLingui();
	const [query, setQuery] = useState("");
	const search = useDeferredValue(query.trim());
	const [highlighted, setHighlighted] = useState("");
	const { data, isSuccess } = cloudTrpc.task.listPage.useQuery({
		search: search || undefined,
		limit: RESULT_LIMIT,
	});
	const { data: statuses } = cloudTrpc.task.statuses.list.useQuery();
	const statusById = useMemo(
		() => new Map((statuses ?? []).map((status) => [status.id, status])),
		[statuses],
	);
	const tasks = (data?.items ?? []).map(({ task }): CloudTask => {
		const status = task.statusId ? statusById.get(task.statusId) : undefined;
		return {
			id: task.id,
			slug: task.slug,
			externalProvider: task.externalProvider,
			externalKey: task.externalKey,
			title: task.title,
			status: status
				? {
						type: status.type,
						color: status.color,
						progressPercent: status.progressPercent,
					}
				: null,
		};
	});
	const highlightedId = tasks.some((task) => task.id === highlighted)
		? highlighted
		: (tasks[0]?.id ?? "");
	return (
		<Command
			shouldFilter={false}
			value={highlightedId}
			onValueChange={setHighlighted}
			onKeyDown={onKeyDown}
		>
			<CommandInput
				autoFocus
				value={query}
				onValueChange={setQuery}
				placeholder={t({ message: "Change or add tasks…" })}
			/>
			<CommandList>
				{isSuccess && (
					<CommandEmpty>
						<Trans>No tasks found.</Trans>
					</CommandEmpty>
				)}
				<CommandGroup>
					{tasks.map((task) => {
						const isLinked = linkedTaskIds.has(task.id);
						return (
							<CommandItem
								key={task.id}
								value={task.id}
								onSelect={() => onToggle(task, isLinked)}
							>
								<Checkbox checked={isLinked} className="pointer-events-none" />
								<CloudTaskIcon task={task} />
								<span className="shrink-0 font-mono text-xs text-muted-foreground">
									{taskDisplayId(task)}
								</span>
								<span className="min-w-0 flex-1 truncate">{task.title}</span>
							</CommandItem>
						);
					})}
				</CommandGroup>
			</CommandList>
		</Command>
	);
}
