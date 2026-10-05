import { Trans, useLingui } from "@lingui/react/macro";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@superset/ui/command";
import { type KeyboardEvent, useState } from "react";
import { LuCheck, LuPlus } from "react-icons/lu";
import { TaskProjectIcon } from "renderer/routes/_authenticated/_dashboard/components/TaskProjectIcon";

interface ProjectOption {
	id: string;
	name: string;
	icon: string | null;
	color: string | null;
}

interface ProjectCommandProps {
	projectId: string | null;
	projects: ProjectOption[];
	onSelect: (projectId: string | null) => void;
	onCreate?: (name: string) => void;
	onKeyDown?: (event: KeyboardEvent) => void;
}

export function ProjectCommand({
	projectId,
	projects,
	onSelect,
	onCreate,
	onKeyDown,
}: ProjectCommandProps) {
	const { t } = useLingui();
	const [query, setQuery] = useState("");
	const newName = query.trim();
	return (
		<Command onKeyDown={onKeyDown}>
			<CommandInput
				autoFocus
				value={query}
				onValueChange={setQuery}
				placeholder={t({ message: "Set project…" })}
			/>
			<CommandList>
				<CommandEmpty>
					<Trans>No projects</Trans>
				</CommandEmpty>
				<CommandGroup>
					<CommandItem value="__none" onSelect={() => onSelect(null)}>
						<span className="flex-1 text-muted-foreground">
							<Trans>No project</Trans>
						</span>
						{!projectId && <LuCheck className="size-3.5" />}
					</CommandItem>
					{projects.map((option) => (
						<CommandItem
							key={option.id}
							value={option.id}
							keywords={[option.name]}
							onSelect={() => onSelect(option.id)}
						>
							<TaskProjectIcon icon={option.icon} color={option.color} />
							<span className="flex-1 truncate">{option.name}</span>
							{projectId === option.id && <LuCheck className="size-3.5" />}
						</CommandItem>
					))}
				</CommandGroup>
				{onCreate && (
					<>
						<CommandSeparator />
						<CommandGroup>
							<CommandItem
								value={`create project ${newName}`}
								onSelect={() => onCreate(newName)}
								forceMount
							>
								<LuPlus className="size-3.5" />
								{newName ? (
									<Trans>Create project "{newName}"</Trans>
								) : (
									<Trans>Create project…</Trans>
								)}
							</CommandItem>
						</CommandGroup>
					</>
				)}
			</CommandList>
		</Command>
	);
}
