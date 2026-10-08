import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar } from "@superset/ui/atoms/Avatar";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { type ReactNode, useState } from "react";
import { HiCheck, HiOutlineUserCircle } from "react-icons/hi2";
import { useLinearWorkspace } from "../../hooks/useLinearWorkspace";

interface LinearAssigneeMenuProps {
	assigneeId: string | null;
	onSelect: (assigneeId: string | null) => void;
	children: ReactNode;
}

export function LinearAssigneeMenu({
	assigneeId,
	onSelect,
	children,
}: LinearAssigneeMenuProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const { data: workspace } = useLinearWorkspace({ enabled: open });

	const select = (next: string | null) => {
		setOpen(false);
		if (next !== assigneeId) onSelect(next);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent align="start" className="w-60 p-0">
				<Command>
					<CommandInput placeholder={t({ message: "Assign to…" })} />
					<CommandList className="max-h-72">
						<CommandEmpty>
							<Trans>No people found.</Trans>
						</CommandEmpty>
						<CommandGroup>
							<CommandItem onSelect={() => select(null)} className="gap-2">
								<HiOutlineUserCircle className="size-5 text-muted-foreground" />
								<span className="flex-1 text-sm">
									<Trans>No assignee</Trans>
								</span>
								{assigneeId === null && <HiCheck className="size-3.5" />}
							</CommandItem>
							{workspace?.users.map((user) => (
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
									{user.id === assigneeId && <HiCheck className="size-3.5" />}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
