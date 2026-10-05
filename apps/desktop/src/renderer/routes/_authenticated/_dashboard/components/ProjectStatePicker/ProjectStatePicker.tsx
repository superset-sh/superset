import type { TaskProjectState } from "@superset/db/schema";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { ReactNode } from "react";
import { LuCheck } from "react-icons/lu";
import {
	PROJECT_STATES,
	ProjectStateIcon,
} from "renderer/routes/_authenticated/_dashboard/components/ProjectStateIcon";
import { useProjectStateLabels } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectStateLabels";

interface ProjectStatePickerProps {
	value: TaskProjectState;
	onChange: (value: TaskProjectState) => void;
	children: ReactNode;
}

export function ProjectStatePicker({
	value,
	onChange,
	children,
}: ProjectStatePickerProps) {
	const labels = useProjectStateLabels();
	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-44 p-1">
				{PROJECT_STATES.map((state) => (
					<DropdownMenuItem key={state} onSelect={() => onChange(state)}>
						<ProjectStateIcon state={state} />
						<span className="flex-1">{labels[state]}</span>
						{state === value && <LuCheck className="size-3.5" />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
