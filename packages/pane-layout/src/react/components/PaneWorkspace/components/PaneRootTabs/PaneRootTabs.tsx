import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PlusIcon } from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PaneWorkspaceStore } from "../../../../../core/store";
import type { PaneRootState } from "../../../../../types";
import { PaneRootTabItem } from "./components/PaneRootTabItem";

interface PaneRootTabsProps<TPaneData> {
	store: StoreApi<PaneWorkspaceStore<TPaneData>>;
	roots: Array<PaneRootState<TPaneData>>;
	activeRootId: string | null;
	onSelectRoot: (rootId: string) => void;
	onAddRoot?: (args: {
		store: StoreApi<PaneWorkspaceStore<TPaneData>>;
	}) => void;
	renderAddRootMenu?: (args: {
		store: StoreApi<PaneWorkspaceStore<TPaneData>>;
	}) => ReactNode;
	getRootTitle?: (root: PaneRootState<TPaneData>) => ReactNode;
}

function AddRootButtonCell<TPaneData>({
	store,
	onAddRoot,
	renderAddRootMenu,
}: {
	store: StoreApi<PaneWorkspaceStore<TPaneData>>;
	onAddRoot?: (args: {
		store: StoreApi<PaneWorkspaceStore<TPaneData>>;
	}) => void;
	renderAddRootMenu?: (args: {
		store: StoreApi<PaneWorkspaceStore<TPaneData>>;
	}) => ReactNode;
}) {
	const button = (
		<div className="flex items-center shrink-0">
			<Button
				className="size-7 rounded-md border border-border/60 bg-muted/30 px-1 text-muted-foreground shadow-none hover:bg-accent/60 hover:text-foreground"
				onClick={renderAddRootMenu ? undefined : () => onAddRoot?.({ store })}
				size="icon"
				type="button"
				variant="ghost"
			>
				<PlusIcon className="size-3.5" />
			</Button>
		</div>
	);

	if (renderAddRootMenu) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-56">
					{renderAddRootMenu({ store })}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	return (
		<Tooltip delayDuration={500}>
			<TooltipTrigger asChild>
				{button}
			</TooltipTrigger>
			<TooltipContent side="top" showArrow={false}>
				Add root
			</TooltipContent>
		</Tooltip>
	);
}

export function PaneRootTabs<TPaneData>({
	store,
	roots,
	activeRootId,
	onSelectRoot,
	onAddRoot,
	renderAddRootMenu,
	getRootTitle,
}: PaneRootTabsProps<TPaneData>) {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const rootsTrackRef = useRef<HTMLDivElement>(null);
	const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);

	const updateOverflow = useCallback(() => {
		const container = scrollContainerRef.current;
		const track = rootsTrackRef.current;
		if (!container || !track) return;
		setHasHorizontalOverflow(track.scrollWidth > container.clientWidth + 1);
	}, []);

	useLayoutEffect(() => {
		const container = scrollContainerRef.current;
		const track = rootsTrackRef.current;
		if (!container || !track) return;

		updateOverflow();
		const resizeObserver = new ResizeObserver(updateOverflow);
		resizeObserver.observe(container);
		resizeObserver.observe(track);
		window.addEventListener("resize", updateOverflow);

		return () => {
			resizeObserver.disconnect();
			window.removeEventListener("resize", updateOverflow);
		};
	}, [updateOverflow]);

	useEffect(() => {
		requestAnimationFrame(updateOverflow);
	}, [roots, updateOverflow]);

	if (roots.length === 0) {
		return null;
	}

	return (
		<div className="flex h-10 min-w-0 shrink-0 items-stretch border-b border-border bg-background">
			<div
				ref={scrollContainerRef}
				className="flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden"
				style={{ scrollbarWidth: "none" }}
			>
				<div ref={rootsTrackRef} className="flex h-full items-stretch">
					{roots.map((root) => (
						<div
							className="h-full shrink-0"
							key={root.id}
							style={{ width: "160px" }}
						>
							<PaneRootTabItem
								getRootTitle={getRootTitle}
								isActive={root.id === activeRootId}
								onSelect={() => onSelectRoot(root.id)}
								root={root}
								store={store}
							/>
						</div>
					))}
					{!hasHorizontalOverflow && (onAddRoot || renderAddRootMenu) ? (
						<div className="flex h-full shrink-0 items-center px-1">
							<AddRootButtonCell
								onAddRoot={onAddRoot}
								renderAddRootMenu={renderAddRootMenu}
								store={store}
							/>
						</div>
					) : null}
				</div>
			</div>
			{hasHorizontalOverflow && (onAddRoot || renderAddRootMenu) ? (
				<div className="flex h-full shrink-0 items-center bg-background/95 pr-1">
					<AddRootButtonCell
						onAddRoot={onAddRoot}
						renderAddRootMenu={renderAddRootMenu}
						store={store}
					/>
				</div>
			) : null}
		</div>
	);
}
