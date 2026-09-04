import type {
	ClientRect,
	CollisionDescriptor,
	CollisionDetection,
	UniqueIdentifier,
} from "@dnd-kit/core";
import type { SortingStrategy } from "@dnd-kit/sortable";

/**
 * A section drag sorts *units*, not rows: a section header carries its member
 * rows with it, and an ungrouped row is a unit of its own. The project's flat
 * item list stays intact (every row keeps its index, DOM node, and height),
 * so nothing shifts at pickup — the strategy below just moves every row of a
 * unit by the same amount.
 */
export interface TopLevelUnit {
	/** The section header's flat id, or the ungrouped row's flat id. */
	key: UniqueIdentifier;
	/** Header first, then its member rows (or the single ungrouped row). */
	ids: UniqueIdentifier[];
}

export function buildTopLevelUnits(
	list: UniqueIdentifier[],
	membership: Record<string, string>,
	isSection: (id: UniqueIdentifier) => boolean,
): TopLevelUnit[] {
	const units: TopLevelUnit[] = [];
	const unitBySection = new Map<string, TopLevelUnit>();
	for (const id of list) {
		if (isSection(id)) {
			const unit: TopLevelUnit = { key: id, ids: [id] };
			units.push(unit);
			unitBySection.set(String(id), unit);
			continue;
		}
		const sectionFlatId = membership[String(id)];
		const owner = sectionFlatId ? unitBySection.get(sectionFlatId) : undefined;
		if (owner) {
			owner.ids.push(id);
		} else {
			units.push({ key: id, ids: [id] });
		}
	}
	return units;
}

export function findUnitIndex(
	units: TopLevelUnit[],
	id: UniqueIdentifier,
): number {
	return units.findIndex((unit) => unit.key === id || unit.ids.includes(id));
}

/** Bounding box of a unit's measured rows; null when none is measured. */
function unionRect(rects: (ClientRect | undefined)[]): ClientRect | null {
	let result: ClientRect | null = null;
	for (const rect of rects) {
		if (!rect) continue;
		if (!result) {
			result = { ...rect };
			continue;
		}
		const top = Math.min(result.top, rect.top);
		const bottom = Math.max(result.top + result.height, rect.top + rect.height);
		const left = Math.min(result.left, rect.left);
		const right = Math.max(result.left + result.width, rect.left + rect.width);
		result = {
			top,
			left,
			bottom,
			right,
			width: right - left,
			height: bottom - top,
		};
	}
	return result;
}

function getUnitGap(
	unitRects: (ClientRect | null)[],
	index: number,
	activeIndex: number,
): number {
	const current = unitRects[index];
	const previous = unitRects[index - 1];
	const next = unitRects[index + 1];
	if (!current) return 0;
	if (activeIndex < index) {
		return previous
			? current.top - (previous.top + previous.height)
			: next
				? next.top - (current.top + current.height)
				: 0;
	}
	return next
		? next.top - (current.top + current.height)
		: previous
			? current.top - (previous.top + previous.height)
			: 0;
}

/**
 * `verticalListSortingStrategy` lifted to units. `items` and `membership` are
 * the project's flat list at the time the strategy was built; `rects` is
 * index-aligned with `items` (sparse — disabled rows have no rect).
 *
 * The dragged unit is the header plus its rows: displaced units open a gap
 * of that full height, and the whole block previews the drop slot in-list
 * while the DragOverlay ghost shows the header alone.
 */
export function createSectionUnitSortingStrategy(
	items: UniqueIdentifier[],
	membership: Record<string, string>,
	isSection: (id: UniqueIdentifier) => boolean,
): SortingStrategy {
	const units = buildTopLevelUnits(items, membership, isSection);
	const unitIndexByItemIndex = new Map<number, number>();
	const indexById = new Map<UniqueIdentifier, number>();
	items.forEach((id, index) => {
		indexById.set(id, index);
	});
	units.forEach((unit, unitIndex) => {
		for (const id of unit.ids) {
			const itemIndex = indexById.get(id);
			if (itemIndex != null) unitIndexByItemIndex.set(itemIndex, unitIndex);
		}
	});

	// dnd-kit calls the strategy once per sortable per pointer move with the
	// same `rects` array; the unit rects are the same for every call in that
	// batch, so derive them once per measurement instead of once per row.
	const unitRectsByRects = new WeakMap<ClientRect[], (ClientRect | null)[]>();
	const getUnitRects = (rects: ClientRect[]) => {
		let unitRects = unitRectsByRects.get(rects);
		if (!unitRects) {
			unitRects = units.map((u) =>
				unionRect(
					u.ids.map((id) => {
						const itemIndex = indexById.get(id);
						return itemIndex == null ? undefined : rects[itemIndex];
					}),
				),
			);
			unitRectsByRects.set(rects, unitRects);
		}
		return unitRects;
	};

	return ({
		activeIndex,
		activeNodeRect: fallbackActiveRect,
		index,
		rects,
		overIndex,
	}) => {
		const activeUnit = unitIndexByItemIndex.get(activeIndex);
		const overUnit = unitIndexByItemIndex.get(overIndex);
		const unit = unitIndexByItemIndex.get(index);
		if (activeUnit == null || overUnit == null || unit == null) return null;
		if (!rects[index]) return null; // hidden / disabled row: nothing to move

		const unitRects = getUnitRects(rects);
		const activeRect = unitRects[activeUnit] ?? fallbackActiveRect;
		if (!activeRect) return null;

		const transform = { x: 0, scaleX: 1, scaleY: 1 };

		if (unit === activeUnit) {
			const overRect = unitRects[overUnit];
			if (!overRect) return null;
			return {
				...transform,
				y:
					activeUnit < overUnit
						? overRect.top +
							overRect.height -
							(activeRect.top + activeRect.height)
						: overRect.top - activeRect.top,
			};
		}

		const gap = getUnitGap(unitRects, unit, activeUnit);
		if (unit > activeUnit && unit <= overUnit) {
			return { ...transform, y: -activeRect.height - gap };
		}
		if (unit < activeUnit && unit >= overUnit) {
			return { ...transform, y: activeRect.height + gap };
		}
		return { ...transform, y: 0 };
	};
}

/**
 * `closestCenter` over units: the dragged section hops past a group when the
 * ghost's center crosses the group's center, not its first row's. Resolves to
 * the unit's key (header or ungrouped row), which is always an enabled
 * droppable.
 */
export function closestUnitCenter(units: TopLevelUnit[]): CollisionDetection {
	return ({ collisionRect, droppableRects, droppableContainers }) => {
		const centerY = collisionRect.top + collisionRect.height / 2;
		const centerX = collisionRect.left + collisionRect.width / 2;
		const containerById = new Map(
			droppableContainers.map((container) => [container.id, container]),
		);
		const collisions: CollisionDescriptor[] = [];
		for (const unit of units) {
			const droppableContainer = containerById.get(unit.key);
			if (!droppableContainer) continue;
			const rect = unionRect(unit.ids.map((id) => droppableRects.get(id)));
			if (!rect) continue;
			const dx = rect.left + rect.width / 2 - centerX;
			const dy = rect.top + rect.height / 2 - centerY;
			collisions.push({
				id: unit.key,
				data: { droppableContainer, value: Math.hypot(dx, dy) },
			});
		}
		return collisions.sort((a, b) => a.data.value - b.data.value);
	};
}
