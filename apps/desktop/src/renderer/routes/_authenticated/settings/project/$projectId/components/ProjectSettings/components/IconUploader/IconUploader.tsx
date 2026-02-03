import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { HiXMark } from "react-icons/hi2";
import { LuUpload } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface IconUploaderProps {
	projectName: string;
	iconUrl: string | null;
	iconOverride: string | null;
	githubOwner: string | null;
	onIconChange: (icon: string | null) => void;
	isPending?: boolean;
}

function getGitHubAvatarUrl(owner: string): string {
	return `https://github.com/${owner}.png?size=64`;
}

export function IconUploader({
	projectName,
	iconUrl,
	iconOverride,
	githubOwner,
	onIconChange,
	isPending = false,
}: IconUploaderProps) {
	const selectImageMutation = electronTrpc.window.selectImageFile.useMutation();

	const effectiveIcon = iconOverride || iconUrl;
	const hasCustomIcon = !!iconOverride;
	const hasDiscoveredIcon = !!iconUrl && !iconOverride;
	const isLoading = isPending || selectImageMutation.isPending;

	async function handleUpload() {
		try {
			const result = await selectImageMutation.mutateAsync();
			if (result.canceled || !result.dataUrl) return;
			onIconChange(result.dataUrl);
		} catch (error) {
			console.error("[icon-uploader] Failed to select image:", error);
		}
	}

	const firstLetter = projectName.charAt(0).toUpperCase();

	return (
		<div className="flex items-start gap-4">
			<div
				className={cn(
					"relative size-16 rounded-lg overflow-hidden flex-shrink-0 border border-border",
					"flex items-center justify-center bg-muted",
				)}
			>
				{effectiveIcon ? (
					<img
						src={effectiveIcon}
						alt={`${projectName} icon`}
						className="size-full object-cover"
					/>
				) : githubOwner ? (
					<img
						src={getGitHubAvatarUrl(githubOwner)}
						alt={`${projectName} avatar`}
						className="size-full object-cover"
					/>
				) : (
					<span className="text-2xl font-medium text-muted-foreground">
						{firstLetter}
					</span>
				)}
			</div>

			<div className="flex-1 min-w-0 space-y-2">
				<div className="text-sm">
					{hasCustomIcon && (
						<span className="text-muted-foreground">Custom icon uploaded</span>
					)}
					{hasDiscoveredIcon && (
						<span className="text-muted-foreground">
							Auto-discovered from project
						</span>
					)}
					{!effectiveIcon && githubOwner && (
						<span className="text-muted-foreground">Using GitHub avatar</span>
					)}
					{!effectiveIcon && !githubOwner && (
						<span className="text-muted-foreground">Using default icon</span>
					)}
				</div>

				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={handleUpload}
						disabled={isLoading}
						className="gap-1.5"
					>
						<LuUpload className="h-4 w-4" />
						{effectiveIcon ? "Change Icon" : "Upload Icon"}
					</Button>

					{hasCustomIcon && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onIconChange(null)}
							disabled={isLoading}
							className="gap-1.5 text-muted-foreground hover:text-foreground"
						>
							<HiXMark className="h-4 w-4" />
							Remove
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
