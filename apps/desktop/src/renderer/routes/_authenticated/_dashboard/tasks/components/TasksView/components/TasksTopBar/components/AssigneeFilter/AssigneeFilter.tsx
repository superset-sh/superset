import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiCheck, HiChevronDown, HiOutlineUserCircle } from "react-icons/hi2";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface AssigneeFilterProps {
	value: string | null;
	onChange: (value: string | null) => void;
}

export function AssigneeFilter({ value, onChange }: AssigneeFilterProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const { data: members } =
		cloudTrpc.organization.listMembers.useQuery(undefined);

	const users = useMemo(
		() => (members ?? []).map((member) => member.user),
		[members],
	);

	const selectedUser = useMemo(() => {
		if (value === null) return null;
		if (value === "unassigned") {
			return {
				id: "unassigned",
				name: t({
					message: "Unassigned",
				}),
				image: null,
			};
		}
		const user = users.find((u) => u.id === value);
		return user ? { id: user.id, name: user.name, image: user.image } : null;
	}, [value, users, t]);

	const query = search.toLowerCase();

	const filteredUsers = useMemo(
		() =>
			users.filter(
				(u) =>
					u.name?.toLowerCase().includes(query) ||
					u.email?.toLowerCase().includes(query),
			),
		[users, query],
	);

	const hasResults = filteredUsers.length > 0;

	const [canScroll, setCanScroll] = useState(false);
	const listRef = useRef<HTMLDivElement>(null);

	const checkScroll = useCallback(() => {
		const el = listRef.current;
		if (!el) return;
		const hasOverflow = el.scrollHeight > el.clientHeight;
		const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
		setCanScroll(hasOverflow && !atBottom);
	}, []);

	useEffect(() => {
		checkScroll();
	}, [checkScroll]);

	const handleSelect = (userId: string | null) => {
		onChange(userId);
		setOpen(false);
	};

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (!next) setSearch("");
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title={
						selectedUser?.name ??
						t({
							message: "Assignee",
						})
					}
					aria-label={
						selectedUser?.name ??
						t({
							message: "Assignee",
						})
					}
					className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					{selectedUser ? (
						<>
							{selectedUser.id === "unassigned" ? (
								<HiOutlineUserCircle className="size-4" />
							) : (
								<Avatar
									size="xs"
									fullName={selectedUser.name}
									image={selectedUser.image}
								/>
							)}
							<span className="text-sm hidden @4xl:inline">
								{selectedUser.name}
							</span>
						</>
					) : (
						<>
							<HiOutlineUserCircle className="size-4" />
							<span className="text-sm hidden @4xl:inline">
								<Trans>Assignee</Trans>
							</span>
						</>
					)}
					<HiChevronDown className="size-3" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-60 p-0">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={t({
							message: "Search people...",
						})}
						value={search}
						onValueChange={setSearch}
					/>
					<div className="relative">
						<CommandList
							ref={listRef}
							className="max-h-80"
							onScroll={checkScroll}
						>
							<CommandGroup>
								<CommandItem onSelect={() => handleSelect(null)}>
									<span className="text-sm">
										<Trans>All assignees</Trans>
									</span>
									{value === null && <HiCheck className="ml-auto size-3.5" />}
								</CommandItem>
								<CommandItem onSelect={() => handleSelect("unassigned")}>
									<HiOutlineUserCircle className="size-4" />
									<span className="text-sm">
										<Trans>Unassigned</Trans>
									</span>
									{value === "unassigned" && (
										<HiCheck className="ml-auto size-3.5" />
									)}
								</CommandItem>
							</CommandGroup>

							{!hasResults && search && (
								<CommandEmpty>
									<Trans>No people found.</Trans>
								</CommandEmpty>
							)}

							{filteredUsers.length > 0 && (
								<>
									<CommandSeparator />
									<CommandGroup>
										{filteredUsers.map((user) => (
											<CommandItem
												key={user.id}
												onSelect={() => handleSelect(user.id)}
											>
												<Avatar
													size="xs"
													fullName={user.name}
													image={user.image}
												/>
												<div className="flex flex-col min-w-0">
													<span className="text-sm truncate">{user.name}</span>
													<span className="text-xs text-muted-foreground truncate">
														{user.email}
													</span>
												</div>
												{user.id === value && (
													<HiCheck className="ml-auto size-3.5 shrink-0" />
												)}
											</CommandItem>
										))}
									</CommandGroup>
								</>
							)}
						</CommandList>
						{canScroll && (
							<div
								className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-popover to-transparent"
								aria-hidden="true"
							/>
						)}
					</div>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
