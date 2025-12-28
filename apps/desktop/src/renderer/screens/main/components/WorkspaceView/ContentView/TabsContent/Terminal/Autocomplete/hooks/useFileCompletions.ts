import { useCallback } from "react";
import { trpc } from "renderer/lib/trpc";
import { useAutocompleteStore } from "../stores/autocomplete-store";

interface UseFileCompletionsOptions {
	cwd: string | null;
}

/**
 * Hook for fetching and managing file completions.
 * Called when user presses Tab in a path context.
 */
export function useFileCompletions({ cwd }: UseFileCompletionsOptions) {
	const openCompletionDropdown = useAutocompleteStore(
		(s) => s.openCompletionDropdown,
	);
	const closeCompletionDropdown = useAutocompleteStore(
		(s) => s.closeCompletionDropdown,
	);
	const commandBuffer = useAutocompleteStore((s) => s.commandBuffer);

	const utils = trpc.useUtils();

	/**
	 * Extract the path portion from the command buffer.
	 * Looks for the last space-separated token that could be a path.
	 */
	const extractPathFromBuffer = useCallback((buffer: string): string | null => {
		if (!buffer.trim()) return null;

		// Split by spaces, get last token
		const tokens = buffer.split(/\s+/);
		const lastToken = tokens[tokens.length - 1];

		// If it looks like a path or starts a path
		if (
			lastToken &&
			(lastToken.includes("/") ||
				lastToken.startsWith(".") ||
				lastToken.startsWith("~") ||
				// Or it's after common path-taking commands
				[
					"cd",
					"ls",
					"cat",
					"vim",
					"code",
					"open",
					"rm",
					"cp",
					"mv",
					"mkdir",
				].includes(tokens[0]))
		) {
			return lastToken;
		}

		return null;
	}, []);

	/**
	 * Trigger file completion for the current command buffer.
	 */
	const triggerCompletion = useCallback(async () => {
		if (!cwd) return false;

		const partial = extractPathFromBuffer(commandBuffer);
		if (!partial && commandBuffer.trim()) {
			// No path context, but there's content - might be after a command
			// Try completing with empty partial (list cwd)
		}

		try {
			const result = await utils.autocomplete.listCompletions.fetch({
				partial: partial || "",
				cwd,
				showHidden: false,
				type: "all",
			});

			if (result.completions.length > 0) {
				openCompletionDropdown(result.completions);
				return true;
			}
			return false;
		} catch {
			return false;
		}
	}, [
		cwd,
		commandBuffer,
		extractPathFromBuffer,
		utils.autocomplete.listCompletions,
		openCompletionDropdown,
	]);

	return {
		triggerCompletion,
		closeCompletionDropdown,
		extractPathFromBuffer,
	};
}
