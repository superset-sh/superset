import type { SelectUser } from "@superset/db/schema";
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
import { useMemo, useState } from "react";
import { HiCheck, HiChevronDown, HiOutlineUserCircle } from "react-icons/hi2";

interface CreateTaskAssigneePickerProps {
	users: SelectUser[];
	value: string | null;
	onChange: (value: string | null) => void;
}

export function CreateTaskAssigneePicker({
	users,
	value,
	onChange,
}: CreateTaskAssigneePickerProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const selectedUser = useMemo(
		() => users.find((user) => user.id === value) ?? null,
		[users, value],
	);

	const filteredUsers = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return users;

		return users.filter((user) => {
			return (
				user.name?.toLowerCase().includes(query) ||
				user.email?.toLowerCase().includes(query)
			);
		});
	}, [search, users]);

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) {
			setSearch("");
		}
	};

	const handleSelect = (nextValue: string | null) => {
		onChange(nextValue);
		setOpen(false);
		setSearch("");
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex h-9 items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3 text-sm transition-colors hover:bg-muted/60"
				>
					{selectedUser ? (
						<>
							<Avatar
								size="xs"
								fullName={selectedUser.name}
								image={selectedUser.image}
							/>
							<span className="max-w-36 truncate">{selectedUser.name}</span>
						</>
					) : (
						<>
							<HiOutlineUserCircle className="size-4 text-muted-foreground" />
							<span className="text-muted-foreground">Assignee</span>
						</>
					)}
					<HiChevronDown className="size-3.5 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-0">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search people..."
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList className="max-h-72">
						<CommandGroup>
							<CommandItem onSelect={() => handleSelect(null)}>
								<HiOutlineUserCircle className="size-4" />
								<span className="flex-1 text-sm">No assignee</span>
								{value === null && <HiCheck className="size-3.5" />}
							</CommandItem>
						</CommandGroup>

						{filteredUsers.length === 0 ? (
							<CommandEmpty>No people found.</CommandEmpty>
						) : (
							<CommandGroup>
								{filteredUsers.map((user) => (
									<CommandItem
										key={user.id}
										onSelect={() => handleSelect(user.id)}
									>
										<Avatar size="xs" fullName={user.name} image={user.image} />
										<div className="flex min-w-0 flex-1 flex-col">
											<span className="truncate text-sm">{user.name}</span>
											<span className="truncate text-xs text-muted-foreground">
												{user.email}
											</span>
										</div>
										{user.id === value && <HiCheck className="size-3.5" />}
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
