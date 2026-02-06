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
	const { mutate: baseMutate, mutateAsync: baseMutateAsync, ...mutationState } =
		mutation;
	type CreateOrAttachInput = Parameters<typeof mutation.mutate>[0];

	const withTheme = useCallback(
		(input: CreateOrAttachInput): CreateOrAttachInput => ({
			...input,
			themeType: input.themeType ?? themeType,
		}),
		[themeType],
	);

	const mutate = useCallback<typeof mutation.mutate>(
		(input, options) => baseMutate(withTheme(input), options),
		[baseMutate, withTheme],
	);

	const mutateAsync = useCallback<typeof mutation.mutateAsync>(
		(input, options) => baseMutateAsync(withTheme(input), options),
		[baseMutateAsync, withTheme],
	);

	return {
		...mutationState,
		mutate,
		mutateAsync,
	};
}
