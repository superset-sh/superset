import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import type React from "react";
import type { RefObject } from "react";
import { useMemo, useState } from "react";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	PRIcon,
	type PRState,
} from "renderer/screens/main/components/PRIcon/PRIcon";

export interface SelectedPR {
	prNumber: number;
	title: string;
	url: string;
	state: string;
}

interface PRLinkCommandProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (pr: SelectedPR) => void;
	projectId: string | null;
	githubOwner: string | null;
	repoName: string | null;
	anchorRef: RefObject<HTMLElement | null>;
}

export function PRLinkCommand({
	open,
	onOpenChange,
	onSelect,
	projectId,
	githubOwner: _githubOwner,
	repoName: _repoName,
	anchorRef,
}: PRLinkCommandProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const debouncedQuery = useDebouncedValue(searchQuery, 300);
	const trimmedQuery = debouncedQuery.trim();

	// Extract PR number from GitHub URL if pasted
	const prNumberFromUrl = useMemo(() => {
		const match = trimmedQuery.match(
			/github\.com\/[\w-]+\/[\w.-]+\/pull\/(\d+)/i,
		);
		return match ? match[1] : null;
	}, [trimmedQuery]);

	// Use PR number for search if URL was pasted, otherwise use the query as-is
	const effectiveQuery = prNumberFromUrl ?? trimmedQuery;

	// Fetch recent PRs for browsing (only when no search query)
	const { data: recentPRs, isLoading: isLoadingRecent } =
		electronTrpc.projects.listPullRequests.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId && open && !trimmedQuery },
		);

	// Server-side search when user types
	const { data: searchResults, isLoading: isSearching } =
		electronTrpc.projects.searchPullRequests.useQuery(
			{ projectId: projectId ?? "", query: effectiveQuery },
			{ enabled: !!projectId && open && !!effectiveQuery },
		);

	const pullRequests = useMemo(() => {
		if (trimmedQuery) {
			return searchResults ?? [];
		}
		return recentPRs ?? [];
	}, [trimmedQuery, searchResults, recentPRs]);

	const isLoading = trimmedQuery ? isSearching : isLoadingRecent;

	const handleClose = () => {
		setSearchQuery("");
		onOpenChange(false);
	};

	const handleSelect = (pr: (typeof pullRequests)[number]) => {
		onSelect({
			prNumber: pr.prNumber,
			title: pr.title,
			url: pr.url,
			state: pr.state,
		});
		handleClose();
	};

	return (
		<Popover open={open}>
			<PopoverAnchor virtualRef={anchorRef as React.RefObject<Element>} />
			<PopoverContent
				className="w-80 p-0"
				align="end"
				side="top"
				onWheel={(event) => event.stopPropagation()}
				onPointerDownOutside={handleClose}
				onEscapeKeyDown={handleClose}
				onFocusOutside={(e) => e.preventDefault()}
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search pull requests..."
						value={searchQuery}
						onValueChange={setSearchQuery}
					/>
					<CommandList className="max-h-[280px]">
						{pullRequests.length === 0 && (
							<CommandEmpty>
								{isLoading
									? trimmedQuery
										? "Searching..."
										: "Loading pull requests..."
									: trimmedQuery
										? "No pull requests found."
										: "No open pull requests."}
							</CommandEmpty>
						)}
						{pullRequests.length > 0 && (
							<CommandGroup
								heading={
									trimmedQuery
										? `${pullRequests.length} result${pullRequests.length === 1 ? "" : "s"}`
										: "Recent pull requests"
								}
							>
								{pullRequests.map((pr) => (
									<CommandItem
										key={pr.prNumber}
										value={`${pr.prNumber}-${pr.title}`}
										onSelect={() => handleSelect(pr)}
										className="group"
									>
										<PRIcon
											state={pr.state as PRState}
											className="size-3.5 shrink-0"
										/>
										<span className="shrink-0 font-mono text-xs text-muted-foreground">
											#{pr.prNumber}
										</span>
										<span className="min-w-0 flex-1 truncate text-xs">
											{pr.title}
										</span>
										<span className="shrink-0 hidden text-xs text-muted-foreground group-data-[selected=true]:inline">
											Link ↵
										</span>
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
