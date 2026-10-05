import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { ReactNode } from "react";
import { HiCheck } from "react-icons/hi2";
import { useLinearWorkspace } from "../../hooks/useLinearWorkspace";
import { type LinearIssue, statusIconType } from "../../utils/linearIssueTypes";
import { StatusIcon } from "../TasksView/components/shared/StatusIcon";

interface LinearStatusMenuProps {
	issue: LinearIssue;
	onSelect: (stateId: string) => void;
	children: ReactNode;
}

export function LinearStatusMenu({
	issue,
	onSelect,
	children,
}: LinearStatusMenuProps) {
	const { data: workspace } = useLinearWorkspace();
	const states =
		workspace?.teams.find((team) => team.id === issue.team.id)?.states ?? [];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-52">
				{states.map((state) => (
					<DropdownMenuItem
						key={state.id}
						onSelect={() => {
							if (state.id !== issue.state.id) onSelect(state.id);
						}}
						className="gap-3"
					>
						<StatusIcon type={statusIconType(state.type)} color={state.color} />
						<span className="flex-1 truncate text-sm">{state.name}</span>
						{state.id === issue.state.id && <HiCheck className="size-3.5" />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
