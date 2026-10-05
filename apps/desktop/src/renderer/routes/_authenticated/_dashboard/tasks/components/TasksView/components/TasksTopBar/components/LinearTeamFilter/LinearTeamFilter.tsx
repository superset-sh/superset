import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { HiCheck, HiChevronDown, HiOutlineUserGroup } from "react-icons/hi2";
import { useLinearWorkspace } from "../../../../../../hooks/useLinearWorkspace";

interface LinearTeamFilterProps {
	value: string | null;
	onChange: (teamId: string | null) => void;
}

export function LinearTeamFilter({ value, onChange }: LinearTeamFilterProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const { data: workspace } = useLinearWorkspace();
	const teams = workspace?.teams ?? [];
	const selected = teams.find((team) => team.id === value);
	const label = selected?.name ?? t({ message: "All teams" });

	const select = (teamId: string | null) => {
		onChange(teamId);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title={label}
					aria-label={label}
					className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					<HiOutlineUserGroup className="size-3.5" />
					<span className="hidden max-w-32 truncate text-sm @4xl:inline">
						{label}
					</span>
					<HiChevronDown className="size-3" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-56 p-0">
				<Command>
					{teams.length > 8 && (
						<CommandInput placeholder={t({ message: "Find a team…" })} />
					)}
					<CommandList className="max-h-72">
						<CommandGroup>
							<CommandItem onSelect={() => select(null)}>
								<span className="flex-1 text-sm">
									{t({ message: "All teams" })}
								</span>
								{value === null && <HiCheck className="size-3.5" />}
							</CommandItem>
							{teams.map((team) => (
								<CommandItem
									key={team.id}
									value={`${team.name} ${team.key}`}
									onSelect={() => select(team.id)}
								>
									<span className="flex-1 truncate text-sm">{team.name}</span>
									<span className="font-mono text-[11px] text-muted-foreground">
										{team.key}
									</span>
									{team.id === value && <HiCheck className="size-3.5" />}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
