import { CommandEmpty, CommandGroup, CommandList } from "@superset/ui/command";
import { useMemo } from "react";
import { useCommandContext } from "../../core/ContextProvider";
import type { Command } from "../../core/types";
import { CommandItemRow } from "../CommandItemRow/CommandItemRow";

interface SubPaletteViewProps {
	parent: Command;
	onSelect: (command: Command) => void;
}

export function SubPaletteView({ parent, onSelect }: SubPaletteViewProps) {
	const context = useCommandContext();

	const children = useMemo<Command[]>(() => {
		if (!parent.children) return [];
		if (typeof parent.children === "function") return parent.children(context);
		return parent.children;
	}, [parent, context]);

	if (parent.renderFrame) {
		return <>{parent.renderFrame()}</>;
	}

	const visible = children.filter((c) => (c.when ? c.when(context) : true));

	return (
		<CommandList>
			<CommandEmpty>Nothing here.</CommandEmpty>
			<CommandGroup heading={parent.title}>
				{visible.map((command) => (
					<CommandItemRow
						key={command.id}
						command={command}
						onSelect={onSelect}
					/>
				))}
			</CommandGroup>
		</CommandList>
	);
}
