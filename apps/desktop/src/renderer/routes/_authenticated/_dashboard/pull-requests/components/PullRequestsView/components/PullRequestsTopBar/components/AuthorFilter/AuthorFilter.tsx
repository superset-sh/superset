import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useQueries } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiCheck, HiChevronDown, HiOutlineUserCircle } from "react-icons/hi2";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { ProjectQueryTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import { groupProjectTargetsByHost } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";

interface AuthorFilterProps {
	value: string | null;
	onChange: (value: string | null) => void;
	projectTargets: ProjectQueryTarget[];
}

export function AuthorFilter({
	value,
	onChange,
	projectTargets,
}: AuthorFilterProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const hostTargets = useMemo(
		() => groupProjectTargetsByHost(projectTargets),
		[projectTargets],
	);

	const contributorQueries = useQueries({
		queries: hostTargets.map((target) => ({
			queryKey: [
				"pullRequests",
				"getRepoContributors",
				target.key,
				target.hostUrl,
			],
			queryFn: async () => {
				if (!target.hostUrl) return [];
				const client = getHostServiceClientByUrl(target.hostUrl);
				return client.workspaceCreation.getRepoContributors.query({
					projectId: target.projects[0]?.projectId ?? "",
					projectIds: target.projects.map((project) => project.projectId),
				});
			},
			enabled: !!target.hostUrl,
			staleTime: 5 * 60_000,
			gcTime: 30 * 60_000,
		})),
	});

	const authors = useMemo(() => {
		const byLogin = new Map<string, { login: string; avatarUrl: string }>();
		for (const query of contributorQueries) {
			for (const author of query.data ?? []) {
				byLogin.set(author.login.toLowerCase(), author);
			}
		}
		return [...byLogin.values()].sort((a, b) =>
			a.login.localeCompare(b.login, undefined, { sensitivity: "base" }),
		);
	}, [contributorQueries]);

	const selectedAuthor = useMemo(
		() =>
			value
				? (authors.find(
						(author) => author.login.toLowerCase() === value.toLowerCase(),
					) ?? { login: value, avatarUrl: "" })
				: null,
		[authors, value],
	);

	const query = search.toLowerCase();
	const filteredAuthors = useMemo(
		() =>
			authors.filter((author) => author.login.toLowerCase().includes(query)),
		[authors, query],
	);

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

	const handleSelect = (login: string | null) => {
		onChange(login);
		setOpen(false);
	};

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (!next) setSearch("");
	};

	const label = selectedAuthor ? `@${selectedAuthor.login}` : "All authors";

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title={label}
					aria-label={`Author: ${label}`}
					className="h-8 max-w-44 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					{selectedAuthor?.avatarUrl ? (
						<Avatar
							size="xs"
							fullName={selectedAuthor.login}
							image={selectedAuthor.avatarUrl}
						/>
					) : (
						<HiOutlineUserCircle className="size-4 shrink-0" />
					)}
					<span className="hidden truncate text-sm @4xl:inline">{label}</span>
					<HiChevronDown className="size-3 shrink-0" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-60 p-0">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search authors..."
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
									<span className="text-sm">All authors</span>
									{value === null && <HiCheck className="ml-auto size-3.5" />}
								</CommandItem>
							</CommandGroup>

							{filteredAuthors.length === 0 && search && (
								<CommandEmpty>No authors found.</CommandEmpty>
							)}

							{filteredAuthors.length > 0 && (
								<CommandGroup>
									{filteredAuthors.map((author) => (
										<CommandItem
											key={author.login}
											onSelect={() => handleSelect(author.login)}
										>
											<Avatar
												size="xs"
												fullName={author.login}
												image={author.avatarUrl}
											/>
											<span className="text-sm truncate">{author.login}</span>
											{value?.toLowerCase() === author.login.toLowerCase() && (
												<HiCheck className="ml-auto size-3.5 shrink-0" />
											)}
										</CommandItem>
									))}
								</CommandGroup>
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
