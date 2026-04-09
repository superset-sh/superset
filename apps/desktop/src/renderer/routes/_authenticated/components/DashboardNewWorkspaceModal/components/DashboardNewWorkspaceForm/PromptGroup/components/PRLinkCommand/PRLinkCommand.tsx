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
	PRIcon,
	type PRState,
} from "renderer/screens/main/components/PRIcon/PRIcon";
import type { WorkspaceHostTarget } from "../../../components/DevicePicker";

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
	hostTarget: WorkspaceHostTarget;
	anchorRef: RefObject<HTMLElement | null>;
}

function normalizeState(state: string, isDraft: boolean): string {
	if (isDraft) return "draft";
	if (state === "OPEN" || state === "open") return "open";
	return state.toLowerCase();
}

export function PRLinkCommand({
	open,
	onOpenChange,
	onSelect,
	projectId,
	hostTarget,
	anchorRef,
}: PRLinkCommandProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const debouncedQuery = useDebouncedValue(searchQuery, 300);
	const { activeHostUrl } = useLocalHostService();

	const hostUrl =
		hostTarget.kind === "local"
			? activeHostUrl
			: `${env.RELAY_URL}/hosts/${hostTarget.hostId}`;

	const { data, isLoading } = useQuery({
		queryKey: [
			"workspaceCreation",
			"searchPullRequests",
			projectId,
			hostUrl,
			debouncedQuery,
		],
		queryFn: async () => {
			if (!hostUrl || !projectId) return { pullRequests: [] };
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaceCreation.searchPullRequests.query({
				projectId,
				query: debouncedQuery.trim() || undefined,
				limit: 30,
			});
		},
		enabled: !!projectId && !!hostUrl && open,
	});

	const pullRequests = data?.pullRequests ?? [];
	const debouncedTrimmed = debouncedQuery.trim();

	const handleClose = () => {
		setSearchQuery("");
		onOpenChange(false);
	};

	const handleSelect = (pr: (typeof pullRequests)[number]) => {
		onSelect({
			prNumber: pr.prNumber,
			title: pr.title,
			url: pr.url,
			state: normalizeState(pr.state, pr.isDraft),
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
