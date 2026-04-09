import type { TabPlacement } from "@superset/local-db";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DEFAULT_TAB_PLACEMENT } from "shared/constants";

export function TabPlacementSection() {
	const utils = electronTrpc.useUtils();
	const { data: tabPlacement } =
		electronTrpc.settings.getTabPlacement.useQuery();
	const setTabPlacement = electronTrpc.settings.setTabPlacement.useMutation({
		onMutate: async ({ placement }) => {
			await utils.settings.getTabPlacement.cancel();
			const previous = utils.settings.getTabPlacement.getData();
			utils.settings.getTabPlacement.setData(undefined, placement);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getTabPlacement.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.settings.getTabPlacement.invalidate();
		},
	});

	return (
		<div>
			<h3 className="text-sm font-medium mb-2">Tab Placement</h3>
			<p className="text-sm text-muted-foreground mb-4">
				Position of the tab bar within the workspace content area
			</p>
			<Select
				value={tabPlacement ?? DEFAULT_TAB_PLACEMENT}
				onValueChange={(value) =>
					setTabPlacement.mutate({ placement: value as TabPlacement })
				}
			>
				<SelectTrigger className="w-[200px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="horizontal">Horizontal (top)</SelectItem>
					<SelectItem value="vertical">Vertical (left)</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
