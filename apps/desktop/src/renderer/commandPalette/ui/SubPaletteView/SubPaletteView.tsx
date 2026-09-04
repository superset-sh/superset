import { Trans, useLingui } from "@lingui/react/macro";
import { CommandEmpty, CommandGroup, CommandList } from "@superset/ui/command";
import { useMemo } from "react";
import { useCommandContext } from "../../core/ContextProvider";
import { rankCommands } from "../../core/rankCommands";
import type { Command } from "../../core/types";
import { CommandItemRow } from "../CommandItemRow/CommandItemRow";

interface SubPaletteViewProps {
	parent: Command;
	query: string;
	onSelect: (command: Command) => void;
}

export function SubPaletteView({
	parent,
	query,
	onSelect,
}: SubPaletteViewProps) {
	const { i18n } = useLingui();
	const context = useCommandContext();

	const children = useMemo<Command[]>(() => {
		if (!parent.children) return [];
		if (typeof parent.children === "function") return parent.children(context);
		return parent.children;
	}, [parent, context]);

	const visible = useMemo(
		() =>
			rankCommands(
				children.filter((c) => (c.when ? c.when(context) : true)),
				query,
			),
		[children, context, query],
	);

	if (parent.renderFrame) {
		return <>{parent.renderFrame()}</>;
	}

	return (
		<CommandList>
			<CommandEmpty>
				<Trans>Nothing here.</Trans>
			</CommandEmpty>
			<CommandGroup heading={i18n._(parent.title)}>
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
