import { useLingui } from "@lingui/react/macro";
import type { SessionConfigOption } from "@superset/chat/protocol";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { type RefObject, useEffect, useRef, useState } from "react";
import { LuCheck, LuSearch, LuStar } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { MENU_LABEL_CLASS, MENU_ROW_CLASS } from "../../../../constants";
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

export function ModelFlyout({
	agentSwitcher,
	model,
	onPick,
	searchRef,
}: {
	agentSwitcher?: AgentSwitcher;
	model: SessionConfigOption | undefined;
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
	const selectTab = (next: string) => {
		if (next === tab) return;
		setTab(next);
		setQuery("");
	};

	const renderRow = (row: Row) => {
		const favorited = isFavorite(row);
		return (
			<DropdownMenuItem
				className={cn(MENU_ROW_CLASS, "group/row pr-1")}
				key={rowKey(row)}
				onSelect={() => pickRow(row)}
				title={row.description}
			>
				<span className="min-w-0 flex-1 truncate">{row.label}</span>
				{row.agentLabel ? (
					<span className="max-w-24 shrink-0 truncate text-[10px] text-muted-foreground">
						{row.agentLabel}
					</span>
				) : null}
				<button
					aria-label={
						favorited
							? t({ message: "Remove from favorites" })
							: t({ message: "Add to favorites" })
					}
					aria-pressed={favorited}
					className={cn(
						"grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:text-foreground",
						!favorited &&
							"opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 group-focus/row:opacity-100",
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
					<LuStar className={cn("size-3.5", favorited && "fill-current")} />
				</button>
				<span className="grid size-5 shrink-0 place-items-center">
					{row.presetId === currentPresetId &&
					row.id === (model?.currentValue ?? null) ? (
						<LuCheck className="size-3.5" />
					) : null}
				</span>
			</DropdownMenuItem>
		);
	};

	return (
		<>
			{agentSwitcher ? (
				<div
					className="flex w-10 shrink-0 flex-col items-center gap-1 border-r p-1"
					role="tablist"
				>
					{[
						{ presetId: FAVORITES_TAB, label: t({ message: "Favorites" }) },
						...agentSwitcher.agents,
					].map((entry) => {
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
									"grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-[11px] text-muted-foreground",
									selected
										? "bg-foreground/[0.11] text-foreground"
										: "opacity-60 hover:bg-foreground/[0.07] hover:opacity-100",
								)}
								key={entry.presetId}
								onClick={() => selectTab(entry.presetId)}
								onPointerEnter={() => selectTab(entry.presetId)}
								role="tab"
								tabIndex={-1}
								title={entry.label}
								type="button"
							>
								{entry.presetId === FAVORITES_TAB ? (
									<LuStar
										className={cn("size-4", selected && "fill-current")}
									/>
								) : icon ? (
									<img alt="" className="size-4 object-contain" src={icon} />
								) : (
									entry.label.slice(0, 2)
								)}
							</button>
						);
					})}
				</div>
			) : null}
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<label className="flex shrink-0 items-center gap-2 border-b px-3 py-2 text-muted-foreground">
					<LuSearch className="size-3.5 shrink-0" />
					<input
						aria-label={t({ message: "Search models" })}
						className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/70"
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") return;
							event.stopPropagation();
							if (event.key === "ArrowDown") {
								event.preventDefault();
								listRef.current
									?.querySelector<HTMLElement>('[role="menuitem"]')
									?.focus();
							} else if (event.key === "Enter") {
								event.preventDefault();
								const first = matches[0];
								if (first) pickRow(first);
							}
						}}
						placeholder={t({ message: "Search models" })}
						ref={searchRef}
						type="text"
						value={query}
					/>
				</label>
				<div className="min-h-0 flex-1 overflow-y-auto p-1" ref={listRef}>
					{groups.length === 0 ? (
						<div className="px-2 py-3 text-xs text-muted-foreground">
							{onFavoritesTab && !needle
								? t({ message: "No favorite models" })
								: t({ message: "No matching models" })}
						</div>
					) : (
						groups.map((group) => (
							<div key={group.id}>
								{group.label ? (
									<div className={MENU_LABEL_CLASS}>{group.label}</div>
								) : null}
								{group.rows.map(renderRow)}
							</div>
						))
					)}
				</div>
			</div>
		</>
	);
}
