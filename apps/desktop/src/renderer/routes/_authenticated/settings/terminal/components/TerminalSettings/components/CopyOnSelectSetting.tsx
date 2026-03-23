import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function CopyOnSelectSetting() {
	const utils = electronTrpc.useUtils();

	const { data: copyOnSelect, isLoading } =
		electronTrpc.settings.getCopyOnSelect.useQuery();

	const setCopyOnSelect = electronTrpc.settings.setCopyOnSelect.useMutation({
		onMutate: async ({ enabled }) => {
			await utils.settings.getCopyOnSelect.cancel();
			const previous = utils.settings.getCopyOnSelect.getData();
			utils.settings.getCopyOnSelect.setData(undefined, enabled);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getCopyOnSelect.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.settings.getCopyOnSelect.invalidate();
		},
	});

	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label htmlFor="copy-on-select" className="text-sm font-medium">
					Copy on select
				</Label>
				<p className="text-xs text-muted-foreground">
					Automatically copy selected text to the clipboard
				</p>
			</div>
			<Switch
				id="copy-on-select"
				checked={copyOnSelect ?? false}
				onCheckedChange={(checked) =>
					setCopyOnSelect.mutate({ enabled: checked })
				}
				disabled={isLoading || setCopyOnSelect.isPending}
			/>
		</div>
	);
}
