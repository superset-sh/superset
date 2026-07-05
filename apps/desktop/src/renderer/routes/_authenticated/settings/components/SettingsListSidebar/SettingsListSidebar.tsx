import { cn } from "@superset/ui/utils";
import { Fragment, type ReactNode, useState } from "react";
import { HiMagnifyingGlass } from "react-icons/hi2";

export interface SettingsListGroup<T> {
	id: string;
	title: string;
	rows: T[];
}

interface SettingsListSidebarProps<T> {
	searchPlaceholder: string;
	searchAriaLabel?: string;
	/** Hide the filter input when every group is empty (no rows at all). */
	hideFilterWhenEmpty?: boolean;
	/** Rendered to the right of the filter input — typically an icon-sized action. */
	toolbar?: ReactNode;
	/** Rendered between the filter and the grouped list — typically a list-row-style "Add" trigger. */
	listHeader?: ReactNode;
	groups: Array<SettingsListGroup<T>>;
	filterRow: (row: T, query: string) => boolean;
	getRowKey: (row: T) => string;
	renderRow: (row: T) => ReactNode;
	emptyLabel: string;
	noMatchLabel: (query: string) => string;
}

export function SettingsListSidebar<T>({
	searchPlaceholder,
	searchAriaLabel,
	hideFilterWhenEmpty,
	toolbar,
	listHeader,
	groups,
	filterRow,
	getRowKey,
	renderRow,
	emptyLabel,
	noMatchLabel,
}: SettingsListSidebarProps<T>) {
	const [filter, setFilter] = useState("");
	const trimmed = filter.trim();

	const filteredGroups = groups.map((g) => ({
		...g,
		rows: trimmed ? g.rows.filter((r) => filterRow(r, trimmed)) : g.rows,
	}));
	const groupsWithRows = filteredGroups.filter((g) => g.rows.length > 0);

	const totalUnfiltered = groups.reduce((sum, g) => sum + g.rows.length, 0);
	const isEmpty = totalUnfiltered === 0;
	const noMatches = !isEmpty && groupsWithRows.length === 0 && trimmed !== "";
	const showGroupHeaders = groupsWithRows.length > 1;
	const showFilter = !(hideFilterWhenEmpty && isEmpty);

	return (
		<div className="w-64 shrink-0 border-r overflow-y-auto">
			<div className="p-3 space-y-3">
				{showFilter && (
					<div className="flex items-center gap-1.5">
						<div className="relative flex-1 min-w-0">
							<HiMagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
							<input
								type="text"
								aria-label={searchAriaLabel}
								placeholder={searchPlaceholder}
								value={filter}
								onChange={(e) => setFilter(e.target.value)}
								className="w-full h-8 pl-8 pr-2 text-sm bg-accent/50 rounded-md border-0 outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
							/>
						</div>
						{toolbar}
					</div>
				)}

				{listHeader}

				{isEmpty && (
					<p className="px-2 text-sm text-muted-foreground">{emptyLabel}</p>
				)}
				{noMatches && (
					<p className="px-2 text-sm text-muted-foreground">
						{noMatchLabel(trimmed)}
					</p>
				)}

				{groupsWithRows.map((group) => (
					<div key={group.id}>
						{showGroupHeaders && (
							<h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2">
								{group.title}
							</h2>
						)}
						<nav className="flex flex-col gap-0.5">
							{group.rows.map((row) => (
								<Fragment key={getRowKey(row)}>{renderRow(row)}</Fragment>
							))}
						</nav>
					</div>
				))}
			</div>
		</div>
	);
}

export function settingsListItemClass(isActive: boolean, extra?: string) {
	return cn(
		"flex items-center px-2 py-1.5 text-sm rounded-md transition-colors",
		isActive
			? "bg-accent text-accent-foreground"
			: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
		extra,
	);
}
