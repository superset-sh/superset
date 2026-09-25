import { msg } from "@lingui/core/macro";
import { Plural, Trans } from "@lingui/react/macro";
import type { AppRouter } from "@superset/host-service";
import { i18n } from "@superset/i18n";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import type { inferRouterOutputs } from "@trpc/server";
import {
	Check,
	ChevronDown,
	GitBranch,
	ListFilter,
	Pencil,
} from "lucide-react";
import { useRef, useState } from "react";
import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import { CommitRow } from "./components/CommitRow";
import { RangeModal } from "./components/RangeModal";

type Commit =
	inferRouterOutputs<AppRouter>["git"]["listCommits"]["commits"][number];

function getFilterLabel(filter: ChangesFilter, commits: Commit[]): string {
	if (filter.kind === "all")
		return i18n._(
			msg({
				message: "All commits",
			}),
		);
	if (filter.kind === "uncommitted")
		return i18n._(
			msg({
				message: "Uncommitted",
			}),
		);
	if (filter.kind === "range") {
		const from = commits.find((c) => c.hash === filter.fromHash);
		const to = commits.find((c) => c.hash === filter.toHash);
		return `${from?.shortHash ?? filter.fromHash.slice(0, 7)}..${to?.shortHash ?? filter.toHash.slice(0, 7)}`;
	}
	const commit = commits.find((c) => c.hash === filter.hash);
	return commit?.shortHash ?? filter.hash.slice(0, 7);
}

interface CommitFilterDropdownProps {
	filter: ChangesFilter;
	onFilterChange: (filter: ChangesFilter) => void;
	commits: Commit[];
	uncommittedCount?: number;
	/** Branch context shown at the menu's foot; renameable when allowed. */
	currentBranchName?: string;
	canRenameBranch?: boolean;
	onRenameBranch?: (newName: string) => void;
}

/**
 * The panel's scope control: which diff the Changes list shows (everything,
 * uncommitted only, one commit, a range), with the workspace branch — and
 * its rename action — tucked into the menu's foot, where the old dedicated
 * branch row used to spend a whole header line.
 *
 * The rename form opens from a menu item via the deferred-open pattern (see
 * ShipControl): a popover opened synchronously would lose its autofocused
 * input to the closing menu's focus scope and dismiss itself.
 */
export function CommitFilterDropdown({
	filter,
	onFilterChange,
	commits,
	uncommittedCount,
	currentBranchName,
	canRenameBranch = false,
	onRenameBranch,
}: CommitFilterDropdownProps) {
	const [rangeModalOpen, setRangeModalOpen] = useState(false);
	const [renameOpen, setRenameOpen] = useState(false);
	const [renameValue, setRenameValue] = useState("");
	const pendingRenameRef = useRef(false);

	const submitRename = () => {
		const trimmed = renameValue.trim();
		if (trimmed && trimmed !== currentBranchName) onRenameBranch?.(trimmed);
		setRenameOpen(false);
	};

	return (
		<>
			<Popover
				open={renameOpen}
				onOpenChange={(open) => {
					if (!open) setRenameOpen(false);
				}}
			>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<PopoverAnchor asChild>
							<button
								type="button"
								className="flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium text-xs hover:bg-accent"
							>
								{/* At rest the trigger is a category chip — "Commits N" —
								    like the PR view's; a narrowed scope shows its value. */}
								{filter.kind === "all" ? (
									<>
										<span className="truncate">
											<Trans>Commits</Trans>
										</span>
										<span className="shrink-0 font-normal text-muted-foreground tabular-nums">
											{commits.length}
										</span>
									</>
								) : (
									<span className="truncate">
										{getFilterLabel(filter, commits)}
									</span>
								)}
								<ChevronDown className="size-3 shrink-0 text-muted-foreground" />
							</button>
						</PopoverAnchor>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						className="w-72"
						onCloseAutoFocus={(event) => {
							if (pendingRenameRef.current) {
								pendingRenameRef.current = false;
								event.preventDefault();
								setRenameValue(currentBranchName ?? "");
								setRenameOpen(true);
							}
						}}
					>
						<DropdownMenuItem onSelect={() => onFilterChange({ kind: "all" })}>
							<div className="flex flex-1 items-center justify-between">
								<span>
									<Trans>All commits</Trans>
								</span>
								{filter.kind === "all" && <Check className="size-3.5" />}
							</div>
						</DropdownMenuItem>

						<DropdownMenuItem
							onSelect={() => onFilterChange({ kind: "uncommitted" })}
						>
							<div className="flex flex-1 items-center justify-between">
								<div>
									<div>
										<Trans>Uncommitted changes</Trans>
									</div>
									{uncommittedCount != null && (
										<div className="text-[10px] text-muted-foreground">
											<Plural
												value={uncommittedCount}
												one="# file changed"
												other="# files changed"
											/>
										</div>
									)}
								</div>
								{filter.kind === "uncommitted" && (
									<Check className="size-3.5" />
								)}
							</div>
						</DropdownMenuItem>

						{commits.length > 1 && (
							<DropdownMenuItem onSelect={() => setRangeModalOpen(true)}>
								<div className="flex flex-1 items-center justify-between">
									<div className="flex items-center gap-2">
										<ListFilter className="size-3.5 text-muted-foreground" />
										<span>
											<Trans>Select range...</Trans>
										</span>
									</div>
									{filter.kind === "range" && <Check className="size-3.5" />}
								</div>
							</DropdownMenuItem>
						)}

						{commits.length > 0 && (
							<>
								<DropdownMenuSeparator />
								{commits.map((commit) => (
									<DropdownMenuItem
										key={commit.hash}
										onSelect={() =>
											onFilterChange({
												kind: "commit",
												hash: commit.hash,
											})
										}
									>
										<CommitRow
											commit={commit}
											isSelected={
												filter.kind === "commit" && filter.hash === commit.hash
											}
										/>
									</DropdownMenuItem>
								))}
							</>
						)}

						{currentBranchName && (
							<>
								<DropdownMenuSeparator />
								{canRenameBranch && onRenameBranch ? (
									<DropdownMenuItem
										onSelect={() => {
											pendingRenameRef.current = true;
										}}
									>
										<div className="flex min-w-0 flex-1 items-center gap-2">
											<GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
											<span
												className="min-w-0 flex-1 truncate font-mono text-xs"
												title={currentBranchName}
											>
												{currentBranchName}
											</span>
											<Pencil className="size-3 shrink-0 text-muted-foreground" />
										</div>
									</DropdownMenuItem>
								) : (
									<div
										className="flex min-w-0 items-center gap-2 px-2 py-1.5 text-muted-foreground"
										title={currentBranchName}
									>
										<GitBranch className="size-3.5 shrink-0" />
										<span className="min-w-0 truncate font-mono text-xs">
											{currentBranchName}
										</span>
									</div>
								)}
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
				<PopoverContent align="start" sideOffset={6} className="w-72 p-2">
					<div className="flex flex-col gap-1.5">
						<span className="text-[11px] text-muted-foreground">
							<Trans>Rename branch</Trans>
						</span>
						<RenameInput
							value={renameValue}
							onChange={setRenameValue}
							onSubmit={submitRename}
							onCancel={() => setRenameOpen(false)}
							className="w-full rounded border border-border/60 bg-transparent px-2 py-1 font-mono text-xs outline-none focus-visible:border-ring"
						/>
					</div>
				</PopoverContent>
			</Popover>

			<RangeModal
				open={rangeModalOpen}
				onOpenChange={setRangeModalOpen}
				commits={commits}
				onSelect={(fromHash, toHash) =>
					onFilterChange({ kind: "range", fromHash, toHash })
				}
			/>
		</>
	);
}
