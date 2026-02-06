import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTheme } from "renderer/stores/theme";
import { resolveTerminalThemeType } from "renderer/stores/theme/utils";

export function useCreateOrAttachWithTheme() {
	const mutation = electronTrpc.terminal.createOrAttach.useMutation();
	const activeTheme = useTheme();
	const themeType = resolveTerminalThemeType({
		activeThemeType: activeTheme?.type,
	});
	type CreateOrAttachInput = Parameters<typeof mutation.mutate>[0];

	const withTheme = useCallback(
		(input: CreateOrAttachInput): CreateOrAttachInput => ({
			...input,
			themeType: input.themeType ?? themeType,
		}),
		[themeType],
	);

	const mutate = useCallback<typeof mutation.mutate>(
		(input, options) => mutation.mutate(withTheme(input), options),
		[mutation, withTheme],
	);

	const mutateAsync = useCallback<typeof mutation.mutateAsync>(
		(input, options) => mutation.mutateAsync(withTheme(input), options),
		[mutation, withTheme],
	);

	return {
		...mutation,
		mutate,
		mutateAsync,
	};
}
