import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import { useQuery } from "@tanstack/react-query";
import Fuse from "fuse.js";
import type React from "react";
import type { RefObject } from "react";
import { useMemo, useState } from "react";
import { env } from "renderer/env.renderer";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	IssueIcon,
	type IssueState,
} from "renderer/screens/main/components/IssueIcon/IssueIcon";
import type { WorkspaceHostTarget } from "../../../components/DevicePicker";

const MAX_RESULTS = 20;

const normalizeIssueState = (state: string): IssueState =>
	state.toLowerCase() === "closed" ? "closed" : "open";

export interface SelectedIssue {
	issueNumber: number;
	title: string;
	url: string;
	state: string;
}

interface GitHubIssueLinkCommandProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (issue: SelectedIssue) => void;
	projectId: string | null;
	hostTarget: WorkspaceHostTarget;
	anchorRef: RefObject<HTMLElement | null>;
}

/** Detect inputs that should hit the server: GitHub issue URLs or `#N` shorthand. */
function isServerLookupQuery(query: string): boolean {
	return /^https?:\/\//.test(query) || /^#\d+$/.test(query);
}

export function GitHubIssueLinkCommand({
	open,
	onOpenChange,
	onSelect,
	projectId,
	hostTarget,
	anchorRef,
}: GitHubIssueLinkCommandProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const { activeHostUrl } = useLocalHostService();

	const trimmedQuery = searchQuery.trim();
	const needsServerLookup = isServerLookupQuery(trimmedQuery);

	const hostUrl =
		hostTarget.kind === "local"
			? activeHostUrl
			: `${env.RELAY_URL}/hosts/${hostTarget.hostId}`;

	// ── Pre-fetch all open issues (for client-side fuzzy filtering) ──
	const { data: listData, isLoading: isListLoading } = useQuery({
		queryKey: [
			"workspaceCreation",
			"searchGitHubIssues",
			"list",
			projectId,
			hostUrl,
		],
		queryFn: async () => {
			if (!hostUrl || !projectId) return { issues: [] };
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaceCreation.searchGitHubIssues.query({
				projectId,
				limit: 100,
			});
		},
		enabled: !!projectId && !!hostUrl && open,
	});

	const allIssues = listData?.issues ?? [];

	// ── Server lookup for URLs and #N shorthand ─────────────────────
	const { data: lookupData, isFetching: isLookupFetching } = useQuery({
		queryKey: [
			"workspaceCreation",
			"searchGitHubIssues",
			"lookup",
			projectId,
			hostUrl,
			trimmedQuery,
		],
		queryFn: async () => {
			if (!hostUrl || !projectId) return { issues: [] };
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaceCreation.searchGitHubIssues.query({
				projectId,
				query: trimmedQuery,
				limit: MAX_RESULTS,
			});
		},
		enabled: !!projectId && !!hostUrl && open && needsServerLookup,
	});

	const repoMismatch =
		lookupData && "repoMismatch" in lookupData
			? lookupData.repoMismatch
			: null;

	// ── Client-side Fuse.js fuzzy search (matches V1 behavior) ──────
	const issuesWithSearchField = useMemo(
		() =>
			allIssues.map((issue) => ({
				...issue,
				issueNumberStr: String(issue.issueNumber),
			})),
		[allIssues],
	);

	const issueFuse = useMemo(
		() =>
			new Fuse(issuesWithSearchField, {
				keys: [
					{ name: "issueNumberStr", weight: 3 },
					{ name: "title", weight: 2 },
				],
				threshold: 0.4,
				ignoreLocation: true,
			}),
		[issuesWithSearchField],
	);

	// ── Resolve final results ───────────────────────────────────────
	const searchResults = useMemo(() => {
		// Server lookup for URLs / #N
		if (needsServerLookup) {
			return lookupData?.issues ?? [];
		}

		// No query — show recent
		if (!trimmedQuery) {
			return allIssues.slice(0, MAX_RESULTS);
		}

		// Client-side fuzzy search for text and bare numbers
		return issueFuse
			.search(trimmedQuery, { limit: MAX_RESULTS })
			.map((r) => r.item);
	}, [needsServerLookup, trimmedQuery, lookupData, allIssues, issueFuse]);

	const isLoading = needsServerLookup ? isLookupFetching : isListLoading;

	const handleClose = () => {
		setSearchQuery("");
		onOpenChange(false);
	};

	const handleSelect = (issue: (typeof searchResults)[number]) => {
		onSelect({
			issueNumber: issue.issueNumber,
			title: issue.title,
			url: issue.url,
			state: issue.state,
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
						placeholder="Search issues..."
						value={searchQuery}
						onValueChange={setSearchQuery}
					/>
					<CommandList className="max-h-[280px]">
						{searchResults.length === 0 && (
							<CommandEmpty>
								{isLoading
									? "Loading issues..."
									: repoMismatch
										? `Issue URL must match ${repoMismatch}.`
										: trimmedQuery
											? "No issues found."
											: "No open issues found."}
							</CommandEmpty>
						)}
						{searchResults.length > 0 && (
							<CommandGroup
								heading={trimmedQuery ? "Results" : "Open issues"}
							>
								{searchResults.map((issue) => (
									<CommandItem
										key={issue.issueNumber}
										value={`${issue.issueNumber}-${issue.title}`}
										onSelect={() => handleSelect(issue)}
										className="group"
									>
										<IssueIcon
											state={normalizeIssueState(issue.state)}
											className="size-3.5 shrink-0"
										/>
										<span className="shrink-0 font-mono text-xs text-muted-foreground">
											#{issue.issueNumber}
										</span>
										<span className="min-w-0 flex-1 truncate text-xs">
											{issue.title}
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
