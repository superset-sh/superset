import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
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
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { HiCheck, HiChevronDown, HiOutlineUserCircle } from "react-icons/hi2";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { ProjectQueryTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import {
	normalizeAuthorFilter,
	normalizeAuthorFilters,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/normalizeAuthorFilter";

interface AuthorFilterProps {
	value: string | null;
	onChange: (value: string | null) => void;
	/** Scoped to a single repo, this drives a live contributor list instead
	 *  of a bare text box — "all repositories" or multiple selected repos
	 *  have no single contributor set to show. */
	projectTargets: ProjectQueryTarget[];
}

export function AuthorFilter({
	value,
	onChange,
	projectTargets,
}: AuthorFilterProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const selectedAuthors = useMemo(() => value?.split(",") ?? [], [value]);
	const isSelected = (login: string) =>
		selectedAuthors.some(
			(author) => author.toLowerCase() === login.toLowerCase(),
		);
	const label = value
		? selectedAuthors.map((author) => `@${author}`).join(", ")
		: t({
				message: "All authors",
			});

	const singleTarget =
		projectTargets.length === 1 ? projectTargets[0] : undefined;

	const {
		data: contributors,
		isLoading,
		error,
	} = useQuery({
		queryKey: [
			"pullRequests",
			"repoContributors",
			singleTarget?.projectId,
			singleTarget?.hostUrl,
		],
		queryFn: async () => {
			if (!singleTarget?.hostUrl) return [];
			const client = getHostServiceClientByUrl(singleTarget.hostUrl);
			return client.workspaceCreation.getRepoContributors.query({
				projectId: singleTarget.projectId,
			});
		},
		enabled: !!singleTarget?.hostUrl,
		staleTime: 5 * 60_000,
		gcTime: 10 * 60_000,
	});

	const filtered = useMemo(() => {
		const q = search.trim().replace(/^@/, "").toLowerCase();
		const list = [...(contributors ?? [])];
		for (const login of selectedAuthors) {
			if (
				!list.some(
					(contributor) =>
						contributor.login.toLowerCase() === login.toLowerCase(),
				)
			) {
				list.push({ login });
			}
		}
		if (!q) return list;
		return list.filter((c) => c.login.toLowerCase().includes(q));
	}, [contributors, search, selectedAuthors]);

	const normalizedSearch = normalizeAuthorFilter(search)?.toLowerCase() ?? null;
	const showCustomOption =
		!!normalizedSearch &&
		!filtered.some((c) => c.login.toLowerCase() === normalizedSearch);

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) setSearch("");
	};

	const handleSelect = (login: string | null) => {
		const next =
			login === null
				? []
				: isSelected(login)
					? selectedAuthors.filter(
							(author) => author.toLowerCase() !== login.toLowerCase(),
						)
					: [...selectedAuthors, login];
		onChange(normalizeAuthorFilters(next.join(",")));
		setSearch("");
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title={label}
					aria-label={t({
						message: `Author: ${label}`,
					})}
					className="h-8 max-w-44 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					<HiOutlineUserCircle className="size-4 shrink-0" />
					<span className="truncate text-sm">{label}</span>
					<HiChevronDown className="size-3 shrink-0" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-0">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={
							singleTarget
								? t({
										message: "Search authors…",
									})
								: t({
										message: "GitHub username…",
									})
						}
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList className="max-h-72">
						{singleTarget && isLoading && !contributors && (
							<div className="px-3 py-4 text-center text-sm text-muted-foreground">
								<Trans>Loading contributors…</Trans>
							</div>
						)}
						{(!search || filtered.length > 0 || showCustomOption) && (
							<CommandGroup>
								{!search && (
									<CommandItem
										aria-checked={!value}
										onSelect={() => handleSelect(null)}
									>
										<HiOutlineUserCircle className="size-4 shrink-0" />
										<span className="text-sm">
											<Trans>All authors</Trans>
										</span>
										{!value && (
											<HiCheck className="ml-auto size-3.5 shrink-0" />
										)}
									</CommandItem>
								)}
								{filtered.map((contributor) => (
									<CommandItem
										key={contributor.login}
										aria-label={contributor.login}
										aria-checked={isSelected(contributor.login)}
										disabled={
											!isSelected(contributor.login) &&
											selectedAuthors.length >= 20
										}
										onSelect={() => handleSelect(contributor.login)}
									>
										<Avatar className="size-4 shrink-0 rounded-sm">
											<AvatarImage
												src={`https://github.com/${contributor.login}.png?size=32`}
												alt={contributor.login}
											/>
											<AvatarFallback className="rounded-sm text-[8px]">
												{contributor.login.slice(0, 1).toUpperCase()}
											</AvatarFallback>
										</Avatar>
										<span className="truncate text-sm">
											{contributor.login}
										</span>
										{isSelected(contributor.login) && (
											<HiCheck className="ml-auto size-3.5 shrink-0" />
										)}
									</CommandItem>
								))}
								{showCustomOption && normalizedSearch && (
									<CommandItem
										disabled={selectedAuthors.length >= 20}
										onSelect={() => handleSelect(normalizedSearch)}
									>
										<HiOutlineUserCircle className="size-4 shrink-0" />
										<span className="text-sm">
											<Trans>Filter by @{normalizedSearch}</Trans>
										</span>
									</CommandItem>
								)}
							</CommandGroup>
						)}
						{singleTarget && !isLoading && error && (
							<div className="px-3 py-4 text-center text-sm text-muted-foreground">
								<Trans>
									Couldn't load contributors — type a username instead.
								</Trans>
							</div>
						)}
						{!isLoading &&
							!error &&
							filtered.length === 0 &&
							!showCustomOption &&
							(!singleTarget ||
								(contributors && contributors.length === 0)) && (
								<CommandEmpty>
									{search ? (
										<Trans>No authors found.</Trans>
									) : (
										<Trans>No contributors found.</Trans>
									)}
								</CommandEmpty>
							)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
