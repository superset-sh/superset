import { useEffect, useMemo, useRef, useState } from "react";
import type {
	ComposerMentionEntry,
	ComposerMentionProvider,
} from "../../types";

export type MentionSection = {
	providerId: string;
	title: string;
	entries: ComposerMentionEntry[];
	emptyState?: string;
	loadingState?: string;
	isLoading: boolean;
};

function matchesQuery(entry: ComposerMentionEntry, query: string): boolean {
	if (!query) return true;
	const lowered = query.toLowerCase();
	if (entry.label.toLowerCase().includes(lowered)) return true;
	return (entry.keywords ?? []).some((keyword) =>
		keyword.toLowerCase().includes(lowered),
	);
}

export function useMentionSources(
	providers: ComposerMentionProvider[],
	menuOpen: boolean,
	query: string,
): MentionSection[] {
	const [staticEntries, setStaticEntries] = useState<
		Record<string, ComposerMentionEntry[]>
	>({});
	const [searchEntries, setSearchEntries] = useState<
		Record<string, ComposerMentionEntry[]>
	>({});
	const [searchPending, setSearchPending] = useState<Record<string, boolean>>(
		{},
	);
	const providersRef = useRef(providers);
	providersRef.current = providers;

	// Load static sources at mount and refresh them each time the menu opens;
	// cached entries stay visible while fresh ones load.
	// biome-ignore lint/correctness/useExhaustiveDependencies: staticEntries gates the initial mount load only
	useEffect(() => {
		if (!menuOpen && Object.keys(staticEntries).length > 0) return;
		const controller = new AbortController();
		for (const provider of providersRef.current) {
			if (provider.source.kind !== "static") continue;
			Promise.resolve(provider.source.load(controller.signal))
				.then((entries) => {
					if (controller.signal.aborted) return;
					setStaticEntries((previous) => ({
						...previous,
						[provider.id]: entries,
					}));
				})
				.catch(() => {});
		}
		return () => controller.abort();
	}, [menuOpen]);

	// Search sources fire per keystroke; aborting the previous request replaces
	// debouncing.
	useEffect(() => {
		if (!menuOpen) return;
		const controller = new AbortController();
		for (const provider of providersRef.current) {
			if (provider.source.kind !== "search") continue;
			if (query === "") {
				setSearchEntries((previous) => ({ ...previous, [provider.id]: [] }));
				setSearchPending((previous) => ({
					...previous,
					[provider.id]: false,
				}));
				continue;
			}
			setSearchPending((previous) => ({ ...previous, [provider.id]: true }));
			provider.source
				.search(query, controller.signal)
				.then((entries) => {
					if (controller.signal.aborted) return;
					setSearchEntries((previous) => ({
						...previous,
						[provider.id]: entries,
					}));
					setSearchPending((previous) => ({
						...previous,
						[provider.id]: false,
					}));
				})
				.catch(() => {});
		}
		return () => controller.abort();
	}, [menuOpen, query]);

	return useMemo(() => {
		const sections: MentionSection[] = [];
		const sorted = [...providers].sort((a, b) => a.priority - b.priority);
		for (const provider of sorted) {
			if (provider.source.kind === "static") {
				const entries = (staticEntries[provider.id] ?? []).filter((entry) =>
					matchesQuery(entry, query),
				);
				if (entries.length > 0) {
					sections.push({
						providerId: provider.id,
						title: provider.title,
						entries,
						isLoading: false,
					});
				}
			} else {
				const entries = query === "" ? [] : (searchEntries[provider.id] ?? []);
				const isLoading = searchPending[provider.id] === true;
				if (entries.length > 0 || query === "" || isLoading) {
					sections.push({
						providerId: provider.id,
						title: provider.title,
						entries,
						emptyState: query === "" ? provider.source.emptyState : undefined,
						loadingState: provider.source.loadingState,
						isLoading,
					});
				}
			}
		}
		return sections;
	}, [providers, staticEntries, searchEntries, searchPending, query]);
}
