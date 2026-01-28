import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Switch } from "@superset/ui/switch";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

type BranchPrefixMode = "github" | "author" | "feat" | "custom" | "none";

const BRANCH_PREFIX_MODE_LABELS: Record<BranchPrefixMode, string> = {
	github: "GitHub username",
	author: "Git author name",
	feat: '"feat" prefix',
	custom: "Custom prefix",
	none: "No prefix",
};

interface BehaviorSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function BehaviorSettings({ visibleItems }: BehaviorSettingsProps) {
	const showConfirmQuit = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_CONFIRM_QUIT,
		visibleItems,
	);
	const showBranchPrefix = isItemVisible(
		SETTING_ITEM_ID.BEHAVIOR_BRANCH_PREFIX,
		visibleItems,
	);

	const utils = electronTrpc.useUtils();

	// Confirm on quit setting
	const { data: confirmOnQuit, isLoading: isConfirmLoading } =
		electronTrpc.settings.getConfirmOnQuit.useQuery();
	const setConfirmOnQuit = electronTrpc.settings.setConfirmOnQuit.useMutation({
		onMutate: async ({ enabled }) => {
			await utils.settings.getConfirmOnQuit.cancel();
			const previous = utils.settings.getConfirmOnQuit.getData();
			utils.settings.getConfirmOnQuit.setData(undefined, enabled);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getConfirmOnQuit.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.settings.getConfirmOnQuit.invalidate();
		},
	});

	const handleConfirmToggle = (enabled: boolean) => {
		setConfirmOnQuit.mutate({ enabled });
	};

	// Branch prefix setting
	const { data: branchPrefix, isLoading: isBranchPrefixLoading } =
		electronTrpc.settings.getBranchPrefix.useQuery();
	const { data: gitInfo } = electronTrpc.settings.getGitInfo.useQuery();
	const setBranchPrefix = electronTrpc.settings.setBranchPrefix.useMutation({
		onMutate: async ({ mode, customPrefix }) => {
			await utils.settings.getBranchPrefix.cancel();
			const previous = utils.settings.getBranchPrefix.getData();
			utils.settings.getBranchPrefix.setData(undefined, {
				mode,
				customPrefix: customPrefix ?? null,
			});
			return { previous };
		},
		onError: (err, _vars, context) => {
			console.error("[settings/branch-prefix] Failed to update:", err);
			if (context?.previous !== undefined) {
				utils.settings.getBranchPrefix.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.settings.getBranchPrefix.invalidate();
		},
	});

	const handleBranchPrefixModeChange = (mode: BranchPrefixMode) => {
		setBranchPrefix.mutate({
			mode,
			customPrefix: mode === "custom" ? branchPrefix?.customPrefix : null,
		});
	};

	const handleCustomPrefixChange = (customPrefix: string) => {
		setBranchPrefix.mutate({
			mode: "custom",
			customPrefix: customPrefix || null,
		});
	};

	const getPreviewPrefix = (): string | null => {
		const mode = branchPrefix?.mode ?? "github";
		switch (mode) {
			case "none":
				return null;
			case "feat":
				return "feat";
			case "custom":
				return branchPrefix?.customPrefix || null;
			case "author":
				return gitInfo?.authorPrefix || "author-name";
			default:
				return gitInfo?.githubUsername || gitInfo?.authorPrefix || "username";
		}
	};

	const previewPrefix = getPreviewPrefix();

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Features</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Configure app features and preferences
				</p>
			</div>

			<div className="space-y-6">
				{/* Confirm on Quit */}
				{showConfirmQuit && (
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label htmlFor="confirm-on-quit" className="text-sm font-medium">
								Confirm before quitting
							</Label>
							<p className="text-xs text-muted-foreground">
								Show a confirmation dialog when quitting the app
							</p>
						</div>
						<Switch
							id="confirm-on-quit"
							checked={confirmOnQuit ?? true}
							onCheckedChange={handleConfirmToggle}
							disabled={isConfirmLoading || setConfirmOnQuit.isPending}
						/>
					</div>
				)}

				{/* Branch Prefix */}
				{showBranchPrefix && (
					<div className="space-y-3">
						<div className="space-y-0.5">
							<Label className="text-sm font-medium">Branch Prefix</Label>
							<p className="text-xs text-muted-foreground">
								Default prefix for new branch names (e.g., username/branch-name)
							</p>
						</div>
						<div className="flex items-center gap-3">
							<Select
								value={branchPrefix?.mode ?? "github"}
								onValueChange={(value) =>
									handleBranchPrefixModeChange(value as BranchPrefixMode)
								}
								disabled={isBranchPrefixLoading || setBranchPrefix.isPending}
							>
								<SelectTrigger className="w-[200px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(
										Object.entries(BRANCH_PREFIX_MODE_LABELS) as [
											BranchPrefixMode,
											string,
										][]
									).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{branchPrefix?.mode === "custom" && (
								<Input
									placeholder="Enter custom prefix"
									value={branchPrefix.customPrefix ?? ""}
									onChange={(e) => handleCustomPrefixChange(e.target.value)}
									className="w-[200px]"
									disabled={isBranchPrefixLoading || setBranchPrefix.isPending}
								/>
							)}
						</div>
						<p className="text-xs text-muted-foreground">
							Preview:{" "}
							<code className="bg-muted px-1.5 py-0.5 rounded text-foreground">
								{previewPrefix ? `${previewPrefix}/branch-name` : "branch-name"}
							</code>
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
