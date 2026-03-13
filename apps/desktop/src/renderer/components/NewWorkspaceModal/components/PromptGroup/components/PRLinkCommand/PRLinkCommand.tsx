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
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	PRIcon,
	type PRState,
} from "renderer/screens/main/components/PRIcon/PRIcon";

const MAX_RESULTS = 20;

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
	anchorRef: RefObject<HTMLElement | null>;
}

export function PRLinkCommand({
	open,
	onOpenChange,
	onSelect,
	projectId,
	anchorRef,
}: PRLinkCommandProps) {
	const [searchQuery, setSearchQuery] = useState("");

	const { data: pullRequests, isLoading } =
		electronTrpc.projects.listPullRequests.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId && open },
		);

	const prsWithSearchField = useMemo(
		() =>
			(pullRequests ?? []).map((pr) => ({
				...pr,
				prNumberStr: String(pr.prNumber),
			})),
		[pullRequests],
	);

	const prFuse = useMemo(
		() =>
			new Fuse(prsWithSearchField, {
				keys: [
					{ name: "prNumberStr", weight: 3 },
					{ name: "title", weight: 2 },
				],
				threshold: 0.4,
				ignoreLocation: true,
			}),
		[prsWithSearchField],
	);

	const searchResults = useMemo(() => {
		if (!prsWithSearchField.length) return [];
		if (!searchQuery) {
			return prsWithSearchField.slice(0, MAX_RESULTS);
		}
		return prFuse
			.search(searchQuery, { limit: MAX_RESULTS })
			.map((r) => r.item);
	}, [prsWithSearchField, searchQuery, prFuse]);

	const handleClose = () => {
		setSearchQuery("");
		onOpenChange(false);
	};

	const handleSelect = (pr: (typeof searchResults)[number]) => {
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
						{searchResults.length === 0 && (
							<CommandEmpty>
								{isLoading
									? "Loading pull requests..."
									: "No open pull requests found."}
							</CommandEmpty>
						)}
						{searchResults.length > 0 && (
							<CommandGroup
								heading={searchQuery ? "Results" : "Open pull requests"}
							>
								{searchResults.map((pr) => (
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
