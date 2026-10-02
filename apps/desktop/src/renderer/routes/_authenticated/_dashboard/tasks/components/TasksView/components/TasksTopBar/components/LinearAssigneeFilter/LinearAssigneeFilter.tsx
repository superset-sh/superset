import { useLingui } from "@lingui/react/macro";
import { Avatar } from "@superset/ui/atoms/Avatar";
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
import { HiCheck, HiChevronDown, HiOutlineUserCircle } from "react-icons/hi2";
import { useLinearWorkspace } from "../../../../../../hooks/useLinearWorkspace";

interface LinearAssigneeFilterProps {
	value: string | null;
	onChange: (assignee: string | null) => void;
}

export function LinearAssigneeFilter({
	value,
	onChange,
}: LinearAssigneeFilterProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const { data: workspace } = useLinearWorkspace();
	const users = workspace?.users ?? [];
	const fixedLabels: Record<string, string> = {
		me: t({ message: "Assigned to me" }),
		unassigned: t({ message: "Unassigned" }),
	};
	const label =
		(value && fixedLabels[value]) ??
		users.find((user) => user.id === value)?.name ??
		t({ message: "Anyone" });

	const select = (assignee: string | null) => {
		onChange(assignee);
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
					<HiOutlineUserCircle className="size-3.5" />
					<span className="hidden max-w-32 truncate text-sm @4xl:inline">
						{label}
					</span>
					<HiChevronDown className="size-3" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-60 p-0">
				<Command>
					<CommandInput placeholder={t({ message: "Find a person…" })} />
					<CommandList className="max-h-72">
						<CommandGroup>
							{[null, "me", "unassigned"].map((option) => (
								<CommandItem
									key={option ?? "anyone"}
									value={option ?? "anyone"}
									onSelect={() => select(option)}
								>
									<span className="flex-1 text-sm">
										{option ? fixedLabels[option] : t({ message: "Anyone" })}
									</span>
									{value === option && <HiCheck className="size-3.5" />}
								</CommandItem>
							))}
						</CommandGroup>
						<CommandGroup>
							{users.map((user) => (
								<CommandItem
									key={user.id}
									value={`${user.displayName} ${user.name} ${user.email ?? ""}`}
									onSelect={() => select(user.id)}
									className="gap-2"
								>
									<Avatar
										size="xs"
										fullName={user.name}
										image={user.avatarUrl ?? undefined}
										className="rounded-full"
									/>
									<span className="flex-1 truncate text-sm">{user.name}</span>
									{user.id === value && <HiCheck className="size-3.5" />}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
