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

function parseGitHubPullRequestUrl(query: string): {
	owner: string;
	repo: string;
	prNumber: string;
} | null {
	const match = query.match(
		/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/i,
	);

	if (!match) return null;

	return {
		owner: match[1],
		repo: match[2],
		prNumber: match[3],
	};
}

export function PRLinkCommand({
	open,
	onOpenChange,
	onSelect,
	projectId,
	githubOwner,
	repoName,
	anchorRef,
}: PRLinkCommandProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const debouncedQuery = useDebouncedValue(searchQuery, 300);
	const trimmedQuery = searchQuery.trim(); // Immediate trim for UI decisions
	const debouncedTrimmed = debouncedQuery.trim(); // Debounced trim for RPC calls

	// Detect if we're in the pending debounce state
	const isPendingDebounce = trimmedQuery !== debouncedTrimmed;

	const parsedPullRequestUrl = useMemo(() => {
		return parseGitHubPullRequestUrl(debouncedTrimmed);
	}, [debouncedTrimmed]);

	const selectedRepositoryLabel = useMemo(() => {
		if (!githubOwner || !repoName) return null;
		return `${githubOwner}/${repoName}`;
	}, [githubOwner, repoName]);

	const pastedRepository = useMemo(() => {
		if (!parsedPullRequestUrl) return null;
		return `${parsedPullRequestUrl.owner}/${parsedPullRequestUrl.repo}`.toLowerCase();
	}, [parsedPullRequestUrl]);

	const isCrossRepositoryUrl = Boolean(
		selectedRepositoryLabel &&
			pastedRepository &&
			pastedRepository !== selectedRepositoryLabel.toLowerCase(),
	);

	// Search by PR number when the pasted URL matches the selected repository.
	const effectiveQuery = parsedPullRequestUrl
		? isCrossRepositoryUrl
			? ""
			: parsedPullRequestUrl.prNumber
		: debouncedTrimmed;

	// Fetch recent PRs for browsing (only when no search query)
	const { data: recentPRs, isLoading: isLoadingRecent } =
		electronTrpc.projects.listPullRequests.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId && open && !debouncedTrimmed },
		);

	// Server-side search when user types (use debounced for RPC)
	const { data: searchResults, isLoading: isSearching } =
		electronTrpc.projects.searchPullRequests.useQuery(
			{ projectId: projectId ?? "", query: effectiveQuery },
			{
				enabled:
					!!projectId && open && !!effectiveQuery && !isCrossRepositoryUrl,
			},
		);

	const pullRequests = useMemo(() => {
		if (isCrossRepositoryUrl) {
			return [];
		}

		// Use debounced value for mode decision to avoid empty gap
		if (debouncedTrimmed) {
			return searchResults ?? [];
		}
		return recentPRs ?? [];
	}, [debouncedTrimmed, isCrossRepositoryUrl, searchResults, recentPRs]);

	const isLoading = isCrossRepositoryUrl
		? false
		: debouncedTrimmed
			? isSearching || isPendingDebounce
			: isLoadingRecent;

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
				align="start"
				side="bottom"
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
									? debouncedTrimmed
										? "Searching..."
										: "Loading pull requests..."
									: isCrossRepositoryUrl
										? `PR URL must match ${selectedRepositoryLabel}.`
										: debouncedTrimmed
											? "No pull requests found."
											: "No open pull requests."}
							</CommandEmpty>
						)}
						{pullRequests.length > 0 && (
							<CommandGroup
								heading={
									debouncedTrimmed
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
