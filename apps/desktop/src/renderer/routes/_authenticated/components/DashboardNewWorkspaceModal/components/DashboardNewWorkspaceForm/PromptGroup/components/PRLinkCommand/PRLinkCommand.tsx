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
	children: ReactNode;
	tooltipLabel: string;
	onSelect: (pr: SelectedPR) => void;
	projectId: string | null;
	hostId: string | null;
}

function normalizeState(state: string, isDraft: boolean): string {
	if (isDraft) return "draft";
	if (state === "OPEN" || state === "open") return "open";
	return state.toLowerCase();
}

export function PRLinkCommand({
	children,
	tooltipLabel,
	onSelect,
	projectId,
	hostId,
}: PRLinkCommandProps) {
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
			"searchPullRequests",
			projectId,
			hostUrl,
			debouncedTrimmed,
			showClosed,
		],
		queryFn: async () => {
			if (!hostUrl || !projectId) return { pullRequests: [] };
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaceCreation.searchPullRequests.query({
				projectId,
				query: debouncedTrimmed || undefined,
				limit: 30,
				includeClosed: showClosed,
			});
		},
		enabled: !!projectId && !!hostUrl && open,
	});

	const pullRequests = data?.pullRequests ?? [];
	const repoMismatch =
		data && "repoMismatch" in data ? data.repoMismatch : null;

	const isLoading =
		debouncedTrimmed || trimmedQuery
			? isFetching || isPendingDebounce
			: isFetching;

	const handleSelect = (pr: (typeof pullRequests)[number]) => {
		onSelect({
			prNumber: pr.prNumber,
			title: pr.title,
			url: pr.url,
			state: normalizeState(pr.state, pr.isDraft),
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
						placeholder="Search pull requests..."
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
						{pullRequests.length === 0 && (
							<CommandEmpty>
								{isLoading
									? debouncedTrimmed
										? "Searching..."
										: "Loading..."
									: repoMismatch
										? `PR URL must match ${repoMismatch}.`
										: debouncedTrimmed
											? showClosed
												? "No pull requests found."
												: "No open pull requests found."
											: showClosed
												? "No pull requests found."
												: "No open pull requests."}
							</CommandEmpty>
						)}
						{pullRequests.length > 0 && (
							<CommandGroup
								heading={
									debouncedTrimmed
										? `${pullRequests.length} result${pullRequests.length === 1 ? "" : "s"}`
										: showClosed
											? "Recent PRs"
											: "Open PRs"
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
											state={normalizeState(pr.state, pr.isDraft) as PRState}
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
