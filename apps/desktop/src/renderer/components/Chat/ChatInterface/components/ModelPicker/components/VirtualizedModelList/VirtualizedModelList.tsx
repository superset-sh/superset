import {
	ModelSelectorInput,
	ModelSelectorName,
} from "@superset/ui/ai-elements/model-selector";
import { cn } from "@superset/ui/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	type KeyboardEvent,
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { ModelProviderIcon } from "renderer/components/ModelProviderIcon";
import type { ModelOption } from "../../../../types";
import {
	filterModelGroupsBySearch,
	type ModelGroup,
} from "../../../../utils/modelOptions";

type ModelListRow =
	| {
			id: string;
			label: string;
			type: "provider";
	  }
	| {
			id: string;
			model: ModelOption;
			label: string;
			type: "model";
	  };

interface VirtualizedModelListProps {
	groupedModels: ModelGroup[];
	onSelectModel: (model: ModelOption) => void;
	onCloseModelSelector: () => void;
}

const PROVIDER_ROW_HEIGHT = 28;
const MODEL_ROW_HEIGHT = 48;

function rowEstimate(row: ModelListRow | undefined): number {
	return row?.type === "provider" ? PROVIDER_ROW_HEIGHT : MODEL_ROW_HEIGHT;
}

function buildRows(groups: ModelGroup[]): ModelListRow[] {
	const rows: ModelListRow[] = [];

	for (const [label, models] of groups) {
		if (models.length === 0) continue;

		rows.push({
			id: `provider:${label}`,
			label,
			type: "provider",
		});

		for (const model of models) {
			rows.push({
				id: `model:${model.id}`,
				model,
				label,
				type: "model",
			});
		}
	}

	return rows;
}

function firstSelectableIndex(rows: ModelListRow[]): number {
	return rows.findIndex((row) => row.type === "model");
}

function nextSelectableIndex(
	rows: ModelListRow[],
	currentIndex: number,
	direction: 1 | -1,
): number {
	if (rows.length === 0) return -1;

	let index = currentIndex;
	for (let offset = 0; offset < rows.length; offset += 1) {
		index = (index + direction + rows.length) % rows.length;
		if (rows[index]?.type === "model") return index;
	}

	return -1;
}

function lastSelectableIndex(rows: ModelListRow[]): number {
	for (let index = rows.length - 1; index >= 0; index -= 1) {
		if (rows[index]?.type === "model") return index;
	}
	return -1;
}

export function VirtualizedModelList({
	groupedModels,
	onSelectModel,
	onCloseModelSelector,
}: VirtualizedModelListProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const deferredSearchQuery = useDeferredValue(searchQuery);
	const scrollElementRef = useRef<HTMLDivElement | null>(null);

	const filteredGroups = useMemo(
		() => filterModelGroupsBySearch(groupedModels, deferredSearchQuery),
		[groupedModels, deferredSearchQuery],
	);
	const rows = useMemo(() => buildRows(filteredGroups), [filteredGroups]);
	const [activeIndex, setActiveIndex] = useState(() =>
		firstSelectableIndex(rows),
	);

	const virtualizer = useVirtualizer({
		count: rows.length,
		estimateSize: (index) => rowEstimate(rows[index]),
		getItemKey: (index) => rows[index]?.id ?? index,
		getScrollElement: () => scrollElementRef.current,
		overscan: 6,
	});

	useEffect(() => {
		setActiveIndex((currentIndex) => {
			if (rows[currentIndex]?.type === "model") return currentIndex;
			return firstSelectableIndex(rows);
		});
	}, [rows]);

	const selectModel = useCallback(
		(model: ModelOption) => {
			onSelectModel(model);
			onCloseModelSelector();
		},
		[onCloseModelSelector, onSelectModel],
	);

	const setActiveAndScroll = useCallback(
		(index: number) => {
			if (index < 0) return;
			setActiveIndex(index);
			virtualizer.scrollToIndex(index, { align: "auto" });
		},
		[virtualizer],
	);

	const handleInputKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setActiveAndScroll(nextSelectableIndex(rows, activeIndex, 1));
				return;
			}

			if (event.key === "ArrowUp") {
				event.preventDefault();
				setActiveAndScroll(nextSelectableIndex(rows, activeIndex, -1));
				return;
			}

			if (event.key === "Home") {
				event.preventDefault();
				setActiveAndScroll(firstSelectableIndex(rows));
				return;
			}

			if (event.key === "End") {
				event.preventDefault();
				setActiveAndScroll(lastSelectableIndex(rows));
				return;
			}

			if (event.key === "Enter") {
				const row = rows[activeIndex];
				if (row?.type !== "model") return;

				event.preventDefault();
				selectModel(row.model);
			}
		},
		[activeIndex, rows, selectModel, setActiveAndScroll],
	);

	const virtualRows = virtualizer.getVirtualItems();

	return (
		<>
			<ModelSelectorInput
				aria-controls="model-selector-list"
				aria-label="Search models"
				placeholder="Search models..."
				value={searchQuery}
				onKeyDown={handleInputKeyDown}
				onValueChange={setSearchQuery}
			/>
			<div
				ref={scrollElementRef}
				aria-label="Models"
				className="max-h-[min(420px,calc(90vh-7rem))] overflow-x-hidden overflow-y-auto overscroll-contain scroll-py-1"
				id="model-selector-list"
				role="listbox"
			>
				{rows.length === 0 ? (
					<div className="py-6 text-center text-sm">No models found.</div>
				) : (
					<div
						className="relative w-full"
						style={{ height: virtualizer.getTotalSize() }}
					>
						{virtualRows.map((virtualRow) => {
							const row = rows[virtualRow.index];
							if (!row) return null;

							return (
								<div
									key={row.id}
									data-index={virtualRow.index}
									className="absolute top-0 left-0 w-full px-1"
									style={{
										contain: "layout style paint",
										transform: `translateY(${virtualRow.start}px)`,
									}}
								>
									{row.type === "provider" ? (
										<div className="flex h-7 items-center px-2 font-medium text-muted-foreground text-xs">
											{row.label}
										</div>
									) : (
										<button
											aria-selected={activeIndex === virtualRow.index}
											className={cn(
												"relative flex h-12 w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden",
												"hover:bg-accent hover:text-accent-foreground",
												activeIndex === virtualRow.index &&
													"bg-accent text-accent-foreground",
											)}
											role="option"
											type="button"
											onClick={() => selectModel(row.model)}
											onPointerMove={() => {
												if (activeIndex !== virtualRow.index) {
													setActiveIndex(virtualRow.index);
												}
											}}
										>
											<ModelProviderIcon
												className="size-3"
												modelId={row.model.name}
												provider={row.model.provider}
											/>
											<div className="flex min-w-0 flex-1 flex-col gap-0.5">
												<ModelSelectorName>{row.model.name}</ModelSelectorName>
												<span className="truncate text-muted-foreground text-xs">
													{row.model.provider}
												</span>
											</div>
										</button>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>
		</>
	);
}
