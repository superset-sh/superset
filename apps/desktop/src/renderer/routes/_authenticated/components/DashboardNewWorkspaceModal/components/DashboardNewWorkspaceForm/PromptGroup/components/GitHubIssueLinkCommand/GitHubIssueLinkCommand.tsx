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
import type React from "react";
import type { RefObject } from "react";
import { useState } from "react";
import { env } from "renderer/env.renderer";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	IssueIcon,
	type IssueState,
} from "renderer/screens/main/components/IssueIcon/IssueIcon";
import type { WorkspaceHostTarget } from "../../../components/DevicePicker";

const MAX_RESULTS = 30;

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

export function GitHubIssueLinkCommand({
	open,
	onOpenChange,
	onSelect,
	projectId,
	hostTarget,
	anchorRef,
}: GitHubIssueLinkCommandProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const debouncedQuery = useDebouncedValue(searchQuery, 300);
	const { activeHostUrl } = useLocalHostService();

	const trimmedQuery = searchQuery.trim();
	const debouncedTrimmed = debouncedQuery.trim();
	const isPendingDebounce = trimmedQuery !== debouncedTrimmed;

	const hostUrl =
		hostTarget.kind === "local"
			? activeHostUrl
			: `${env.RELAY_URL}/hosts/${hostTarget.hostId}`;

	const { data, isFetching } = useQuery({
		queryKey: [
			"workspaceCreation",
			"searchGitHubIssues",
			projectId,
			hostUrl,
			debouncedTrimmed,
		],
		queryFn: async () => {
			if (!hostUrl || !projectId) return { issues: [] };
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaceCreation.searchGitHubIssues.query({
				projectId,
				query: debouncedTrimmed || undefined,
				limit: MAX_RESULTS,
			});
		},
		enabled: !!projectId && !!hostUrl && open,
	});

	const searchResults = data?.issues ?? [];
	const repoMismatch =
		data && "repoMismatch" in data ? data.repoMismatch : null;

	const isLoading =
		debouncedTrimmed || trimmedQuery
			? isFetching || isPendingDebounce
			: isFetching;

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
									? debouncedTrimmed
										? "Searching..."
										: "Loading..."
									: repoMismatch
										? `Issue URL must match ${repoMismatch}.`
										: debouncedTrimmed
											? "No issues found."
											: "No issues found."}
							</CommandEmpty>
						)}
						{searchResults.length > 0 && (
							<CommandGroup
								heading={
									debouncedTrimmed
										? `${searchResults.length} result${searchResults.length === 1 ? "" : "s"}`
										: "Recent issues"
								}
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
