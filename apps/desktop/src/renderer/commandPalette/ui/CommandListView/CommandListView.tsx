import { Trans, useLingui } from "@lingui/react/macro";
import { CommandEmpty, CommandGroup, CommandList } from "@superset/ui/command";
import { useMemo } from "react";
import { useCommandContext } from "../../core/ContextProvider";
import { rankSections } from "../../core/rankCommands";
import type { Command } from "../../core/types";
import { useActiveCommands } from "../../core/useActiveCommands";
import { CommandItemRow } from "../CommandItemRow/CommandItemRow";

interface CommandListViewProps {
	query: string;
	onSelect: (command: Command) => void;
}

export function CommandListView({ query, onSelect }: CommandListViewProps) {
	const { i18n } = useLingui();
	const context = useCommandContext();
	const sections = useActiveCommands(context);
	const ranked = useMemo(
		() => rankSections(sections, query),
		[sections, query],
	);

	return (
		<CommandList>
			<CommandEmpty>
				<Trans>No commands found.</Trans>
			</CommandEmpty>
			{ranked.map((section) => (
				<CommandGroup key={section.id} heading={i18n._(section.label)}>
					{section.commands.map((command) => (
						<CommandItemRow
							key={command.id}
							command={command}
							onSelect={onSelect}
						/>
					))}
				</CommandGroup>
			))}
		</CommandList>
	);
}
