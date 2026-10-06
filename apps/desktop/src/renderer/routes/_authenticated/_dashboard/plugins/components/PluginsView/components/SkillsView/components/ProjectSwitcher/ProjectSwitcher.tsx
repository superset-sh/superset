import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuChevronDown } from "react-icons/lu";

interface ProjectSwitcherProps {
	projects: { id: string; name: string }[];
	selectedId: string | null;
	onSelect: (projectId: string) => void;
}

export function ProjectSwitcher({
	projects,
	selectedId,
	onSelect,
}: ProjectSwitcherProps) {
	const selected = projects.find((project) => project.id === selectedId);
	if (projects.length <= 1) {
		return (
			<span className="text-sm font-medium text-foreground">
				{selected?.name}
			</span>
		);
	}
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="-ml-2 gap-1 text-sm font-medium"
				>
					{selected?.name ?? <Trans>Choose a project</Trans>}
					<LuChevronDown className="size-3.5 text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
				<DropdownMenuRadioGroup
					value={selectedId ?? undefined}
					onValueChange={onSelect}
				>
					{projects.map((project) => (
						<DropdownMenuRadioItem key={project.id} value={project.id}>
							{project.name}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
