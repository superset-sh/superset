import { useLingui } from "@lingui/react/macro";
import type { SessionConfigOption } from "@superset/chat/protocol";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import {
	type KeyboardEvent,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import { LuCheck, LuSearch, LuStar } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { MENU_ROW_CLASS } from "../../../../constants";
import { useFavoriteModels } from "../../hooks/useFavoriteModels";
import type { AgentSwitcher } from "../../types";

type Row = {
	presetId: string;
	id: string | null;
	label: string;
	description?: string;
	agentLabel?: string;
};

const FAVORITES_TAB = "favorites";
const SHORTCUT_ROW_LIMIT = 9;
const SHORTCUT_MODIFIER =
	typeof navigator !== "undefined" &&
	navigator.platform.toLowerCase().includes("mac")
		? "⌘"
		: "Ctrl ";

export function ModelPanel({
	agentSwitcher,
	model,
	onLeave,
	onPick,
	searchRef,
}: {
	agentSwitcher?: AgentSwitcher;
	model: SessionConfigOption | undefined;
	/** Tab past the last agent tab (or Shift+Tab before the first) leaves the panel. */
	onLeave?: (direction: 1 | -1) => void;
	onPick: (modelId: string) => void;
	searchRef: RefObject<HTMLInputElement | null>;
}) {
	const { t } = useLingui();
	const isDark = useIsDarkTheme();
	const currentPresetId = agentSwitcher?.currentPresetId ?? "";
	const [query, setQuery] = useState("");
	const [tab, setTab] = useState(currentPresetId);
	const { favorites, toggle } = useFavoriteModels();
	const listRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const frame = requestAnimationFrame(() => searchRef.current?.focus());
		return () => cancelAnimationFrame(frame);
	}, [searchRef]);

	const rowKey = (row: Row) => `${row.presetId}:${row.id ?? ""}`;
	const isFavorite = (row: Row) =>
		favorites.some(
			(favorite) =>
				favorite.presetId === row.presetId && favorite.id === row.id,
		);
	const rowsFor = (presetId: string): Row[] => {
		if (presetId === currentPresetId && model) {
			return model.options.map((option) => ({ ...option, presetId }));
		}
		const models =
			presetId === currentPresetId
				? []
				: (agentSwitcher?.agents.find((agent) => agent.presetId === presetId)
						?.models ?? []);
		return models.length > 0
			? models.map((entry) => ({ ...entry, presetId }))
			: [{ presetId, id: null, label: t({ message: "Default" }) }];
	};
	const onFavoritesTab = tab === FAVORITES_TAB;
	const rows: Row[] = onFavoritesTab
		? favorites.flatMap((favorite) => {
				const agent = agentSwitcher?.agents.find(
					(entry) => entry.presetId === favorite.presetId,
				);
				return agent ? [{ ...favorite, agentLabel: agent.label }] : [];
			})
		: rowsFor(tab);
	const pickRow = (row: Row) => {
		if (row.presetId === currentPresetId) {
			if (row.id) onPick(row.id);
			return;
		}
		agentSwitcher?.onSwitch(
			row.presetId,
			row.id ? { id: row.id, label: row.label } : null,
		);
	};

	const needle = query.trim().toLowerCase();
	const matches = rows.filter((row) =>
		`${row.label} ${row.agentLabel ?? ""}`.toLowerCase().includes(needle),
	);
	const starred = onFavoritesTab ? [] : matches.filter(isFavorite);
	const rest = onFavoritesTab
		? matches
		: matches.filter((row) => !isFavorite(row));
	const groups = [
		{ id: "favorites", label: t({ message: "Favorites" }), rows: starred },
		{
			id: "all",
			label: starred.length > 0 ? t({ message: "All models" }) : null,
			rows: rest,
		},
	].filter((group) => group.rows.length > 0);
	const orderedRows = groups.flatMap((group) => group.rows);
	const tabs = agentSwitcher
		? [
				{ presetId: FAVORITES_TAB, label: t({ message: "Favorites" }) },
				...agentSwitcher.agents,
			]
		: [];
	const selectTab = (next: string) => {
		if (next === tab) return;
		setTab(next);
		setQuery("");
	};
	const cycleTab = (direction: 1 | -1) => {
		const index = tabs.findIndex((entry) => entry.presetId === tab);
		const target = index + direction;
		if (onLeave && (target < 0 || target >= tabs.length)) {
			onLeave(direction);
			return;
		}
		const next = tabs[(target + tabs.length) % tabs.length];
		if (next) selectTab(next.presetId);
	};
	// Tab walks the agent tabs instead of leaving the menu; mod+digit picks a row.
	const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Tab") {
			if (tabs.length === 0 && !onLeave) return;
			event.preventDefault();
			event.stopPropagation();
			cycleTab(event.shiftKey ? -1 : 1);
			return;
		}
		if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
		const digit = Number(event.key);
		if (!Number.isInteger(digit) || digit < 1 || digit > SHORTCUT_ROW_LIMIT) {
			return;
		}
		const row = orderedRows[digit - 1];
		if (!row) return;
		event.preventDefault();
		event.stopPropagation();
		pickRow(row);
	};

	const renderRow = (row: Row, index: number) => {
		const favorited = isFavorite(row);
		const selected =
			row.presetId === currentPresetId &&
			row.id === (model?.currentValue ?? null);
		return (
			<DropdownMenuItem
				aria-current={selected ? "true" : undefined}
				className={cn(MENU_ROW_CLASS, "pr-1")}
				key={rowKey(row)}
				onSelect={() => pickRow(row)}
				title={row.description}
			>
				<span className="min-w-0 flex-1 truncate">{row.label}</span>
				{row.agentLabel ? (
					<span className="max-w-24 shrink-0 truncate text-[11px] text-muted-foreground">
						{row.agentLabel}
					</span>
				) : null}
				{index < SHORTCUT_ROW_LIMIT ? (
					<kbd className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-sm bg-foreground/[0.06] px-1 font-sans text-[10px] text-muted-foreground">
						{SHORTCUT_MODIFIER}
						{index + 1}
					</kbd>
				) : null}
				<span className="grid size-5 shrink-0 place-items-center">
					{selected ? <LuCheck className="size-3.5" /> : null}
				</span>
				<button
					aria-label={
						favorited
							? t({ message: "Remove from favorites" })
							: t({ message: "Add to favorites" })
					}
					aria-pressed={favorited}
					className={cn(
						"grid size-5 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground/50 hover:text-foreground",
						favorited && "text-amber-400 hover:text-amber-300",
					)}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						if (row.id) {
							toggle({
								presetId: row.presetId,
								id: row.id,
								label: row.label,
							});
						}
						searchRef.current?.focus();
					}}
					onPointerDown={(event) => event.stopPropagation()}
					onPointerUp={(event) => event.stopPropagation()}
					tabIndex={-1}
					type="button"
				>
					<LuStar className={cn("size-3", favorited && "fill-current")} />
				</button>
			</DropdownMenuItem>
		);
	};

	let rowIndex = 0;
	return (
		<div className="flex min-h-0 flex-col" onKeyDownCapture={onPanelKeyDown}>
			{tabs.length > 0 ? (
				<div
					className="flex shrink-0 items-center gap-0.5 border-b px-1.5 py-1.5"
					role="tablist"
				>
					{tabs.map((entry) => {
						const selected = entry.presetId === tab;
						const icon =
							entry.presetId === FAVORITES_TAB
								? null
								: getPresetIcon(entry.presetId, isDark);
						return (
							<button
								aria-label={entry.label}
								aria-selected={selected}
								className={cn(
									"relative flex h-7 min-w-7 shrink-0 cursor-pointer items-center justify-center rounded-md px-1.5 text-[11px] text-muted-foreground/70 transition-colors hover:bg-foreground/[0.07] hover:text-foreground",
									selected &&
										"text-foreground after:absolute after:inset-x-1.5 after:-bottom-1.5 after:h-0.5 after:rounded-full after:bg-foreground",
								)}
								key={entry.presetId}
								onClick={() => selectTab(entry.presetId)}
								role="tab"
								tabIndex={-1}
								title={entry.label}
								type="button"
							>
								{entry.presetId === FAVORITES_TAB ? (
									<LuStar
										className={cn("size-3.5", selected && "fill-current")}
									/>
								) : icon ? (
									<img
										alt=""
										className={cn(
											"size-4 object-contain",
											!selected && "opacity-70",
										)}
										src={icon}
									/>
								) : (
									entry.label.slice(0, 2)
								)}
							</button>
						);
					})}
				</div>
			) : null}
			<label className="flex shrink-0 items-center gap-2 border-b px-2.5 text-muted-foreground">
				<LuSearch className="size-3.5 shrink-0 text-muted-foreground/60" />
				<input
					aria-label={t({ message: "Search models" })}
					className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape" || event.key === "Tab") return;
						event.stopPropagation();
						if (event.key === "ArrowDown") {
							event.preventDefault();
							listRef.current
								?.querySelector<HTMLElement>('[role="menuitem"]')
								?.focus();
						} else if (event.key === "Enter") {
							event.preventDefault();
							const first = orderedRows[0];
							if (first) pickRow(first);
						}
					}}
					placeholder={t({ message: "Search models" })}
					ref={searchRef}
					type="text"
					value={query}
				/>
			</label>
			<div
				className="max-h-[200px] min-h-20 overflow-y-auto overscroll-contain p-1"
				ref={listRef}
				role="tabpanel"
			>
				{groups.length === 0 ? (
					<div className="px-2 py-3 text-[13px] leading-relaxed text-muted-foreground">
						{onFavoritesTab && !needle
							? t({ message: "No favorite models" })
							: t({ message: "No matching models" })}
					</div>
				) : (
					groups.map((group) => (
						<div className="flex flex-col gap-px" key={group.id}>
							{group.label ? (
								<div className="px-2 pt-1.5 pb-1 text-[11px] text-muted-foreground/60">
									{group.label}
								</div>
							) : null}
							{group.rows.map((row) => renderRow(row, rowIndex++))}
						</div>
					))
				)}
			</div>
		</div>
	);
}
