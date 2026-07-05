import { Checkbox } from "@superset/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import Fuse from "fuse.js";
import type React from "react";
import type { RefObject } from "react";
import { useId, useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	IssueIcon,
	type IssueState,
} from "renderer/screens/main/components/IssueIcon/IssueIcon";

const MAX_RESULTS = 20;

// Normalize issue state to valid IssueState type
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
	anchorRef: RefObject<HTMLElement | null>;
}

export function GitHubIssueLinkCommand({
	open,
	onOpenChange,
	onSelect,
	projectId,
	anchorRef,
}: GitHubIssueLinkCommandProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [showClosed, setShowClosed] = useState(false);
	const showClosedId = useId();

	const { data: issues, isLoading } = electronTrpc.projects.listIssues.useQuery(
		{ projectId: projectId ?? "", includeClosed: showClosed },
		{ enabled: !!projectId && open },
	);

	const issuesWithSearchField = useMemo(
		() =>
			(issues ?? []).map((issue) => ({
				...issue,
				issueNumberStr: String(issue.issueNumber),
			})),
		[issues],
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

	const searchResults = useMemo(() => {
		if (!issuesWithSearchField.length) return [];
		if (!searchQuery) {
			return issuesWithSearchField.slice(0, MAX_RESULTS);
		}
		const trimmedQuery = searchQuery.trim();
		const urlMatch = issuesWithSearchField.find(
			(issue) => issue.url === trimmedQuery,
		);
		if (urlMatch) return [urlMatch];
		return issueFuse
			.search(trimmedQuery, { limit: MAX_RESULTS })
			.map((r) => r.item);
	}, [issuesWithSearchField, searchQuery, issueFuse]);

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
									? "Loading issues..."
									: showClosed
										? "No issues found."
										: "No open issues found."}
							</CommandEmpty>
						)}
						{searchResults.length > 0 && (
							<CommandGroup
								heading={
									searchQuery
										? "Results"
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
