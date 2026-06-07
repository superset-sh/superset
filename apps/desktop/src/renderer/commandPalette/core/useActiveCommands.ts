import { useMemo, useSyncExternalStore } from "react";
import { getProviders, subscribeToProviders } from "./registry";
import { resolveSectionOrder, SECTION_LABELS } from "./sections";
import type { Command, CommandContext, CommandSection } from "./types";

export function useActiveCommands(context: CommandContext): CommandSection[] {
	const providers = useSyncExternalStore(
		subscribeToProviders,
		getProviders,
		getProviders,
	);

	return useMemo(() => {
		const commands: Command[] = [];
		const seenIds = new Set<string>();
		for (const provider of providers) {
			for (const command of provider.provide(context)) {
				if (seenIds.has(command.id)) continue;
				if (command.when && !command.when(context)) continue;
				seenIds.add(command.id);
				commands.push(command);
			}
		}

		const order = resolveSectionOrder(context);
		const bySection = new Map<string, Command[]>();
		for (const command of commands) {
			const bucket = bySection.get(command.section);
			if (bucket) bucket.push(command);
			else bySection.set(command.section, [command]);
		}

		const sections: CommandSection[] = [];
		for (const id of order) {
			const list = bySection.get(id);
			if (!list || list.length === 0) continue;
			sections.push({ id, label: SECTION_LABELS[id], commands: list });
		}
		return sections;
	}, [providers, context]);
}
