import type { DefinitionSummary } from "@superset/shared/agent-library";
import { Badge } from "@superset/ui/badge";
import { Checkbox } from "@superset/ui/checkbox";
import { cn } from "@superset/ui/utils";
import { Plus } from "lucide-react";
import { useState } from "react";
import { HiMagnifyingGlass } from "react-icons/hi2";
import { settingsListItemClass } from "../../../../../components/SettingsListSidebar";
import { type DefinitionRefKey, refKeyOf } from "../../AgentLibrarySettings";
import { BulkModelBar } from "./components/BulkModelBar";

export interface ScopeInfo {
	scopeKey: string;
	kind: "user" | "project";
	label: string;
	rootPath: string;
}

interface AgentLibrarySidebarProps {
	definitions: DefinitionSummary[];
	scopes: ScopeInfo[];
	selectedKey: DefinitionRefKey | null;
	checkedKeys: Set<DefinitionRefKey>;
	onSelect: (key: DefinitionRefKey) => void;
	onToggleChecked: (key: DefinitionRefKey) => void;
	onCreate: () => void;
	checkedAgentCount: number;
	onBulkSetModel: (model: string | null) => void;
	isBulkUpdating: boolean;
}

export function AgentLibrarySidebar({
	definitions,
	scopes,
	selectedKey,
	checkedKeys,
	onSelect,
	onToggleChecked,
	onCreate,
	checkedAgentCount,
	onBulkSetModel,
	isBulkUpdating,
}: AgentLibrarySidebarProps) {
	const [filter, setFilter] = useState("");
	const query = filter.trim().toLowerCase();

	const matches = (item: DefinitionSummary) =>
		!query ||
		item.name.toLowerCase().includes(query) ||
		item.description.toLowerCase().includes(query);

	const groups = scopes
		.map((scope) => ({
			scope,
			rows: definitions.filter(
				(item) => item.scopeKey === scope.scopeKey && matches(item),
			),
		}))
		.filter((group) => group.rows.length > 0);

	const groupTitle = (scope: ScopeInfo) =>
		scope.kind === "user" ? "User (~/.claude)" : scope.label || "Project";

	return (
		<div className="w-72 shrink-0 border-r flex flex-col min-h-0">
			<div className="p-3 space-y-3 flex-1 overflow-y-auto">
				<div className="flex items-center gap-1.5">
					<div className="relative flex-1 min-w-0">
						<HiMagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
						<input
							type="text"
							aria-label="Filter agents and skills"
							placeholder="Filter…"
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
							className="w-full h-8 pl-8 pr-2 text-sm bg-accent/50 rounded-md border-0 outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
						/>
					</div>
					<button
						type="button"
						aria-label="New agent or skill"
						onClick={onCreate}
						className={settingsListItemClass(false, "px-1.5")}
					>
						<Plus className="size-4" />
					</button>
				</div>

				{definitions.length === 0 && (
					<p className="px-2 text-sm text-muted-foreground">
						No agents or skills on this host yet.
					</p>
				)}
				{definitions.length > 0 && groups.length === 0 && (
					<p className="px-2 text-sm text-muted-foreground">
						No matches for "{filter.trim()}"
					</p>
				)}

				{groups.map(({ scope, rows }) => (
					<div key={scope.scopeKey}>
						<h2
							className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2 truncate"
							title={scope.rootPath}
						>
							{groupTitle(scope)}
						</h2>
						<nav className="flex flex-col gap-0.5">
							{rows.map((item) => {
								const key = refKeyOf(item);
								const isActive = key === selectedKey;
								return (
									<div
										key={key}
										className={cn(
											settingsListItemClass(isActive, "gap-2 w-full"),
											"group/row",
										)}
									>
										{item.kind === "agent" ? (
											<Checkbox
												aria-label={`Select ${item.name} for bulk actions`}
												checked={checkedKeys.has(key)}
												onCheckedChange={() => onToggleChecked(key)}
												className={cn(
													"shrink-0",
													!checkedKeys.has(key) &&
														"opacity-0 group-hover/row:opacity-100 data-[state=checked]:opacity-100",
												)}
											/>
										) : (
											<span className="w-4 shrink-0" />
										)}
										<button
											type="button"
											onClick={() => onSelect(key)}
											className="flex items-center gap-2 flex-1 min-w-0 text-left"
										>
											<span className="truncate flex-1">{item.name}</span>
											{item.kind === "agent" && item.model && (
												<span className="text-[10px] text-muted-foreground truncate max-w-20">
													{item.model}
												</span>
											)}
											<Badge
												variant="outline"
												className="shrink-0 px-1 py-0 text-[10px] font-normal"
											>
												{item.kind}
											</Badge>
										</button>
									</div>
								);
							})}
						</nav>
					</div>
				))}
			</div>

			{checkedAgentCount > 0 && (
				<BulkModelBar
					count={checkedAgentCount}
					onApply={onBulkSetModel}
					isApplying={isBulkUpdating}
				/>
			)}
		</div>
	);
}
