import { cn } from "@superset/ui/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileIcon } from "renderer/lib/fileIcons";
import type { ChangesetFile } from "../../../../../useChangeset";

interface DiffHeaderPrefixProps {
	file: ChangesetFile;
	collapsed: boolean;
	onSetCollapsed: (value: boolean) => void;
}

export function DiffHeaderPrefix({
	file,
	collapsed,
	onSetCollapsed,
}: DiffHeaderPrefixProps) {
	const prefixRef = useRef<HTMLDivElement>(null);
	const [headerHovered, setHeaderHovered] = useState(false);
	const onToggle = useCallback(
		() => onSetCollapsed(!collapsed),
		[onSetCollapsed, collapsed],
	);

	useEffect(() => {
		const show = () => setHeaderHovered(true);
		const hide = () => setHeaderHovered(false);
		let header: Element | null = null;
		let frame = 0;
		const connect = () => {
			header =
				prefixRef.current
					?.closest("diffs-container")
					?.shadowRoot?.querySelector("[data-diffs-header='default']") ?? null;
			if (!header) {
				frame = requestAnimationFrame(connect);
				return;
			}
			header.addEventListener("pointerenter", show);
			header.addEventListener("pointerleave", hide);
			setHeaderHovered(header.matches(":hover"));
		};
		connect();
		return () => {
			cancelAnimationFrame(frame);
			header?.removeEventListener("pointerenter", show);
			header?.removeEventListener("pointerleave", hide);
		};
	}, []);

	return (
		<div ref={prefixRef} className="relative size-3.5 shrink-0">
			<FileIcon
				fileName={file.path}
				className={cn(
					"size-3.5 transition-opacity duration-100",
					headerHovered && "opacity-0",
				)}
			/>
			<button
				type="button"
				onPointerDown={(event) => event.stopPropagation()}
				onClick={(event) => {
					event.stopPropagation();
					onToggle();
				}}
				onFocus={() => setHeaderHovered(true)}
				onBlur={() => setHeaderHovered(false)}
				aria-label={collapsed ? "Expand file" : "Collapse file"}
				className={cn(
					"absolute -inset-1 flex items-center justify-center rounded text-muted-foreground/60 transition-all duration-100 hover:bg-accent hover:text-muted-foreground",
					!headerHovered && "pointer-events-none opacity-0",
				)}
			>
				{collapsed ? (
					<ChevronRight className="size-3.5" />
				) : (
					<ChevronDown className="size-3.5" />
				)}
			</button>
		</div>
	);
}
