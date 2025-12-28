import debounce from "lodash/debounce";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { trpc } from "renderer/lib/trpc";
import { useAutocompleteStore } from "../stores/autocomplete-store";

interface UseGhostSuggestionOptions {
	workspaceId: string;
	enabled?: boolean;
	debounceMs?: number;
}

/**
 * Hook that fetches ghost text suggestions based on the current command buffer.
 * Uses debouncing to avoid excessive API calls.
 */
export function useGhostSuggestion({
	workspaceId,
	enabled = true,
	debounceMs = 100,
}: UseGhostSuggestionOptions) {
	const commandBuffer = useAutocompleteStore((s) => s.commandBuffer);
	const setSuggestion = useAutocompleteStore((s) => s.setSuggestion);

	const utils = trpc.useUtils();
	const lastQueryRef = useRef<string>("");

	const fetchSuggestion = useCallback(
		async (prefix: string) => {
			if (!prefix || prefix.length < 2) {
				setSuggestion(null);
				return;
			}

			// Skip if same as last query
			if (prefix === lastQueryRef.current) {
				return;
			}
			lastQueryRef.current = prefix;

			try {
				const result = await utils.autocomplete.getRecentMatch.fetch({
					prefix,
					workspaceId,
				});

				// Only update if this is still the current query
				if (prefix === lastQueryRef.current) {
					setSuggestion(result, prefix);
				}
			} catch {
				// Silently fail - don't break typing experience
			}
		},
		[setSuggestion, utils.autocomplete.getRecentMatch, workspaceId],
	);

	const debouncedFetch = useMemo(
		() => debounce(fetchSuggestion, debounceMs),
		[fetchSuggestion, debounceMs],
	);

	// Fetch suggestion when command buffer changes
	useEffect(() => {
		if (!enabled) {
			setSuggestion(null);
			return;
		}

		const trimmed = commandBuffer.trim();
		if (trimmed) {
			debouncedFetch(trimmed);
		} else {
			setSuggestion(null);
			debouncedFetch.cancel();
			lastQueryRef.current = "";
		}

		return () => {
			debouncedFetch.cancel();
		};
	}, [commandBuffer, enabled, debouncedFetch, setSuggestion]);

	// Clear on unmount
	useEffect(() => {
		return () => {
			setSuggestion(null);
			debouncedFetch.cancel();
		};
	}, [setSuggestion, debouncedFetch]);

	return {
		suggestion: useAutocompleteStore((s) => s.suggestion),
		commandBuffer,
	};
}
