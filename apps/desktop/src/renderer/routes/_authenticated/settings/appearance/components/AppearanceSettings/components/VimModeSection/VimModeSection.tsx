import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function VimModeSection() {
	const utils = electronTrpc.useUtils();

	const { data: vimMode, isLoading } =
		electronTrpc.settings.getVimMode.useQuery();
	const setVimMode = electronTrpc.settings.setVimMode.useMutation({
		onMutate: async ({ enabled }) => {
			await utils.settings.getVimMode.cancel();
			const previous = utils.settings.getVimMode.getData();
			utils.settings.getVimMode.setData(undefined, enabled);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getVimMode.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.settings.getVimMode.invalidate();
		},
	});

	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label htmlFor="vim-mode" className="text-sm font-medium">
					Vim mode
				</Label>
				<p className="text-xs text-muted-foreground">
					Use Vim keybindings in file and code editors
				</p>
			</div>
			<Switch
				id="vim-mode"
				checked={vimMode ?? false}
				onCheckedChange={(enabled) => setVimMode.mutate({ enabled })}
				disabled={isLoading || setVimMode.isPending}
			/>
		</div>
	);
}
