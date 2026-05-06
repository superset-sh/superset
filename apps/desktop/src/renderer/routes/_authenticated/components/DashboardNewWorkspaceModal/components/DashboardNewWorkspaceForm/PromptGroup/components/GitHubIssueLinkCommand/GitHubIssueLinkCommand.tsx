import { Checkbox } from "@superset/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	IssueIcon,
	type IssueState,
} from "renderer/screens/main/components/IssueIcon/IssueIcon";

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
	children: ReactNode;
	tooltipLabel: string;
	onSelect: (issue: SelectedIssue) => void;
	projectId: string | null;
	hostId: string | null;
}

export function GitHubIssueLinkCommand({
	children,
	tooltipLabel,
	onSelect,
	projectId,
	hostId,
}: GitHubIssueLinkCommandProps) {
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [showClosed, setShowClosed] = useState(false);
	const showClosedId = useId();
	const debouncedQuery = useDebouncedValue(searchQuery, 300);
	const hostUrl = useHostUrl(hostId);

	const trimmedQuery = searchQuery.trim();
	const debouncedTrimmed = debouncedQuery.trim();
	const isPendingDebounce = trimmedQuery !== debouncedTrimmed;

	const { data, isFetching } = useQuery({
		queryKey: [
			"workspaceCreation",
			"searchGitHubIssues",
			projectId,
			hostUrl,
			debouncedTrimmed,
			showClosed,
		],
		queryFn: async () => {
			if (!hostUrl || !projectId) return { issues: [] };
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaceCreation.searchGitHubIssues.query({
				projectId,
				query: debouncedTrimmed || undefined,
				limit: MAX_RESULTS,
				includeClosed: showClosed,
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

	const handleSelect = (issue: (typeof searchResults)[number]) => {
		onSelect({
			issueNumber: issue.issueNumber,
			title: issue.title,
			url: issue.url,
			state: issue.state,
		});
		setSearchQuery("");
		setOpen(false);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				if (!next) setSearchQuery("");
				setOpen(next);
			}}
		>
			<Tooltip>
				<PopoverTrigger asChild>
					<TooltipTrigger asChild>{children}</TooltipTrigger>
				</PopoverTrigger>
				<TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
			</Tooltip>
			<PopoverContent
				className="w-80 p-0"
				align="start"
				side="bottom"
				onWheel={(event) => event.stopPropagation()}
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search issues..."
						value={searchQuery}
						onValueChange={setSearchQuery}
					/>
					<div className="flex items-center gap-2 border-b px-3 py-2">
						<Checkbox
							id={showClosedId}
							checked={showClosed}
							onCheckedChange={(checked) => setShowClosed(checked === true)}
						/>
						<label
							htmlFor={showClosedId}
							className="cursor-pointer select-none text-xs text-muted-foreground"
						>
							Show closed
						</label>
					</div>
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
											? showClosed
												? "No issues found."
												: "No open issues found."
											: showClosed
												? "No issues found."
												: "No open issues found."}
							</CommandEmpty>
						)}
						{searchResults.length > 0 && (
							<CommandGroup
								heading={
									debouncedTrimmed
										? `${searchResults.length} result${searchResults.length === 1 ? "" : "s"}`
										: showClosed
											? "Recent issues"
											: "Open issues"
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
