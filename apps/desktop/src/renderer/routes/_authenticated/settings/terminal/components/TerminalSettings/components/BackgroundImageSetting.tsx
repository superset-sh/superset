import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Slider } from "@superset/ui/slider";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function BackgroundImageSetting() {
	const utils = electronTrpc.useUtils();

	const { data: bgSettings, isLoading } =
		electronTrpc.settings.getTerminalBackground.useQuery();

	const setTerminalBackground =
		electronTrpc.settings.setTerminalBackground.useMutation({
			onMutate: async (input) => {
				await utils.settings.getTerminalBackground.cancel();
				const previous = utils.settings.getTerminalBackground.getData();
				utils.settings.getTerminalBackground.setData(undefined, {
					image: input.image ?? previous?.image ?? null,
					opacity: input.opacity ?? previous?.opacity ?? 85,
					blur: input.blur ?? previous?.blur ?? 8,
				});
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getTerminalBackground.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getTerminalBackground.invalidate();
			},
		});

	const image = bgSettings?.image ?? null;
	const opacity = bgSettings?.opacity ?? 85;
	const blur = bgSettings?.blur ?? 8;

	const handleSelectImage = async () => {
		try {
			const result = await (window as unknown as { electronAPI?: { showOpenDialog?: (options: unknown) => Promise<{ canceled: boolean; filePaths: string[] }> } }).electronAPI?.showOpenDialog?.({
				properties: ["openFile"],
				filters: [
					{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
				],
			});
			if (result && !result.canceled && result.filePaths[0]) {
				setTerminalBackground.mutate({ image: result.filePaths[0] });
			}
		} catch {
			// Fallback: prompt for path manually
			const path = prompt("Enter image file path:");
			if (path) {
				setTerminalBackground.mutate({ image: path });
			}
		}
	};

	return (
		<div className="space-y-4">
			<div className="space-y-0.5">
				<Label className="text-sm font-medium">Background image</Label>
				<p className="text-xs text-muted-foreground">
					Set a background image for the terminal with blur and opacity controls
				</p>
			</div>

			<div className="flex items-center gap-2">
				<Input
					value={image ?? ""}
					onChange={(e) =>
						setTerminalBackground.mutate({ image: e.target.value || null })
					}
					placeholder="Path to image file..."
					className="flex-1 text-xs"
					disabled={isLoading}
				/>
				<Button
					variant="outline"
					size="sm"
					onClick={handleSelectImage}
					disabled={isLoading}
				>
					Browse
				</Button>
				{image && (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setTerminalBackground.mutate({ image: null })}
						disabled={isLoading}
					>
						Clear
					</Button>
				)}
			</div>

			{image && (
				<div className="space-y-3 pl-1">
					<div className="space-y-1.5">
						<div className="flex items-center justify-between">
							<Label className="text-xs">Opacity</Label>
							<span className="text-xs text-muted-foreground">{opacity}%</span>
						</div>
						<Slider
							value={[opacity]}
							onValueChange={([v]) =>
								setTerminalBackground.mutate({ opacity: v })
							}
							min={0}
							max={100}
							step={5}
						/>
					</div>

					<div className="space-y-1.5">
						<div className="flex items-center justify-between">
							<Label className="text-xs">Blur</Label>
							<span className="text-xs text-muted-foreground">{blur}px</span>
						</div>
						<Slider
							value={[blur]}
							onValueChange={([v]) =>
								setTerminalBackground.mutate({ blur: v })
							}
							min={0}
							max={50}
							step={1}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
