import { afterAll, expect, mock, test } from "bun:test";
import {
	type CollisionDetection,
	type DragStartEvent,
	MeasuringStrategy,
} from "@dnd-kit/core";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const registered = GlobalRegistrator.isRegistered;
if (!registered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
mock.module(
	"renderer/routes/_authenticated/hooks/useDashboardSidebarState",
	() => ({
		useDashboardSidebarState: () => ({}),
	}),
);
mock.module("renderer/stores/workspace-creates", () => ({
	useWorkspaceTransactionsStore: () => ({}),
}));
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useSidebarDnd } = await import("../useSidebarDnd");

afterAll(async () => {
	cleanup();
	if (!registered) await GlobalRegistrator.unregister();
});

test("only collection drags discard measurements taken before dragging", async () => {
	const { result } = renderHook(() =>
		useSidebarDnd({
			projects: [{ id: "root", children: [] }] as unknown as Parameters<
				typeof useSidebarDnd
			>[0]["projects"],
			pinnedWorkspaces: [],
			sessionChildren: [],
			onReorderProjects: () => {},
			collectionLayout: {
				rootKeys: ["projects:team", "root"],
				collections: [{ id: "projects:team", tag: "team", projectIds: [] }],
			},
		}),
	);
	expect(result.current.measuring.droppable.strategy).toBe(
		MeasuringStrategy.Always,
	);
	await act(async () => {
		result.current.handlers.onDragStart({
			active: { id: "projects:team" },
		} as DragStartEvent);
	});
	expect(result.current.measuring.droppable.strategy).toBe(
		MeasuringStrategy.WhileDragging,
	);
	await act(async () => {
		result.current.handlers.onDragCancel();
	});
	expect(result.current.measuring.droppable.strategy).toBe(
		MeasuringStrategy.Always,
	);
	await act(async () => {
		result.current.handlers.onDragStart({
			active: { id: "root" },
		} as DragStartEvent);
	});
	expect(result.current.measuring.droppable.strategy).toBe(
		MeasuringStrategy.Always,
	);
	await act(async () => {
		result.current.handlers.onDragCancel();
	});
});

test("the upper half of a collection label accepts a root reorder", () => {
	const { result } = renderHook(() =>
		useSidebarDnd({
			projects: [{ id: "root", children: [] }] as unknown as Parameters<
				typeof useSidebarDnd
			>[0]["projects"],
			pinnedWorkspaces: [],
			sessionChildren: [],
			onReorderProjects: () => {},
			collectionLayout: {
				rootKeys: ["projects:team", "root"],
				collections: [{ id: "projects:team", tag: "team", projectIds: [] }],
			},
		}),
	);
	const header = {
		left: 0,
		right: 240,
		top: 100,
		bottom: 128,
		width: 240,
		height: 28,
	};
	const label = {
		left: 28,
		right: 212,
		top: 104,
		bottom: 124,
		width: 184,
		height: 20,
	};
	const args = {
		active: { id: "root" },
		droppableContainers: ["projects:team", "collection-drop:projects:team"].map(
			(id) => ({ id, data: { current: {} } }),
		),
		droppableRects: new Map([
			["projects:team", header],
			["collection-drop:projects:team", label],
		]),
		pointerCoordinates: { x: 120, y: 107 },
		collisionRect: header,
	} as unknown as Parameters<CollisionDetection>[0];
	expect(result.current.collisionDetection(args)[0]?.id).toBe("projects:team");
	expect(
		result.current.collisionDetection({
			...args,
			pointerCoordinates: { x: 120, y: 121 },
		})[0]?.id,
	).toBe("collection-drop:projects:team");
});
