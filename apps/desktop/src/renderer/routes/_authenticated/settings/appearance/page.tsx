import type { ProjectThumbnailSource } from "@superset/local-db";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { createFileRoute } from "@tanstack/react-router";
import { trpc } from "renderer/lib/trpc";
import {
	type MarkdownStyle,
	useMarkdownStyle,
	useSetMarkdownStyle,
	useSetTheme,
	useThemeId,
	useThemeStore,
} from "renderer/stores";
import { builtInThemes } from "shared/themes";
import { ThemeCard } from "./components/ThemeCard";

export const Route = createFileRoute("/_authenticated/settings/appearance/")({
	component: AppearanceSettingsPage,
});

function AppearanceSettingsPage() {
	const activeThemeId = useThemeId();
	const setTheme = useSetTheme();
	const customThemes = useThemeStore((state) => state.customThemes);
	const markdownStyle = useMarkdownStyle();
	const setMarkdownStyle = useSetMarkdownStyle();
	const utils = trpc.useUtils();

	// Project thumbnail source setting
	const { data: thumbnailSource, isLoading: isThumbnailLoading } =
		trpc.settings.getProjectThumbnailSource.useQuery();

	const setThumbnailSource = trpc.settings.setProjectThumbnailSource.useMutation(
		{
			onMutate: async ({ source }) => {
				await utils.settings.getProjectThumbnailSource.cancel();
				const previous = utils.settings.getProjectThumbnailSource.getData();
				utils.settings.getProjectThumbnailSource.setData(undefined, source);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getProjectThumbnailSource.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getProjectThumbnailSource.invalidate();
			},
		},
	);

	const handleThumbnailSourceChange = (value: string) => {
		setThumbnailSource.mutate({ source: value as ProjectThumbnailSource });
	};

	const allThemes = [...builtInThemes, ...customThemes];

	return (
		<div className="p-6 max-w-4xl">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Appearance</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Customize how Superset looks on your device
				</p>
			</div>

			<div className="space-y-8">
				{/* Theme Section */}
				<div>
					<h3 className="text-sm font-medium mb-4">Theme</h3>
					<div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
						{allThemes.map((theme) => (
							<ThemeCard
								key={theme.id}
								theme={theme}
								isSelected={activeThemeId === theme.id}
								onSelect={() => setTheme(theme.id)}
							/>
						))}
					</div>
				</div>

				<div className="pt-6 border-t">
					<h3 className="text-sm font-medium mb-2">Markdown Style</h3>
					<p className="text-sm text-muted-foreground mb-4">
						Rendering style for markdown files when viewing rendered content
					</p>
					<Select
						value={markdownStyle}
						onValueChange={(value) => setMarkdownStyle(value as MarkdownStyle)}
					>
						<SelectTrigger className="w-[200px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="default">Default</SelectItem>
							<SelectItem value="tufte">Tufte</SelectItem>
						</SelectContent>
					</Select>
					<p className="text-xs text-muted-foreground mt-2">
						Tufte style uses elegant serif typography inspired by Edward Tufte's
						books
					</p>
				</div>

				<div className="pt-6 border-t">
					<h3 className="text-sm font-medium mb-2">Project Thumbnail</h3>
					<p className="text-sm text-muted-foreground mb-4">
						Choose how project thumbnails are displayed in the sidebar
					</p>
					<Select
						value={thumbnailSource ?? "text"}
						onValueChange={handleThumbnailSourceChange}
						disabled={isThumbnailLoading || setThumbnailSource.isPending}
					>
						<SelectTrigger className="w-[200px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="text">Text (first letter)</SelectItem>
							<SelectItem value="github">GitHub avatar</SelectItem>
						</SelectContent>
					</Select>
					<p className="text-xs text-muted-foreground mt-2">
						Text shows the project's first letter; GitHub shows the repository
						owner's avatar
					</p>
				</div>

				<div className="pt-6 border-t">
					<h3 className="text-sm font-medium mb-2">Custom Themes</h3>
					<p className="text-sm text-muted-foreground">
						Custom theme import coming soon. You'll be able to import JSON theme
						files to create your own themes.
					</p>
				</div>
			</div>
		</div>
	);
}
