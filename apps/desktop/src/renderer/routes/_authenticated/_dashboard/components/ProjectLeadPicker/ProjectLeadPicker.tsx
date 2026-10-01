import { Trans } from "@lingui/react/macro";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { ReactNode } from "react";
import { LuCheck, LuCircleUser, LuUserPlus } from "react-icons/lu";

interface Person {
	id: string;
	name: string;
	image: string | null;
}

interface ProjectLeadPickerProps {
	people: Person[];
	value: string | null;
	onChange: (userId: string | null) => void;
	onInvite?: () => void;
	children: ReactNode;
}

export function ProjectLeadPicker({
	people,
	value,
	onChange,
	onInvite,
	children,
}: ProjectLeadPickerProps) {
	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56 p-1">
				<div className="max-h-[50vh] overflow-x-hidden overflow-y-auto">
					<DropdownMenuItem onSelect={() => onChange(null)}>
						<LuCircleUser className="size-4 text-muted-foreground" />
						<span className="flex-1">
							<Trans>No lead</Trans>
						</span>
						{value === null && <LuCheck className="size-3.5" />}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					{people.map((person) => (
						<DropdownMenuItem
							key={person.id}
							onSelect={() => onChange(person.id)}
						>
							<AvatarStack people={[person]} size={16} surface="popover" />
							<span className="min-w-0 flex-1 truncate">{person.name}</span>
							{person.id === value && <LuCheck className="size-3.5" />}
						</DropdownMenuItem>
					))}
				</div>
				{onInvite && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={onInvite}>
							<LuUserPlus className="size-4 text-muted-foreground" />
							<Trans>Invite member</Trans>
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
