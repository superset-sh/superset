import type { ToolKind } from "@superset/chat/protocol";
import {
	FileText,
	FileX,
	Globe,
	MoveRight,
	PencilLine,
	Search,
	Sparkles,
	SquareTerminal,
	Wrench,
} from "lucide-react";
import type { ComponentType } from "react";

const ICON_BY_KIND: Record<ToolKind, ComponentType<{ className?: string }>> = {
	read: FileText,
	edit: PencilLine,
	delete: FileX,
	move: MoveRight,
	search: Search,
	execute: SquareTerminal,
	think: Sparkles,
	fetch: Globe,
	other: Wrench,
};

export function toolKindIcon(
	kind: ToolKind,
): ComponentType<{ className?: string }> {
	return ICON_BY_KIND[kind] ?? Wrench;
}
