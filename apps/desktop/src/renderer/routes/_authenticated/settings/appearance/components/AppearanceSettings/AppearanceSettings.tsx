import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Slider } from "@superset/ui/slider";
import {
	WINDOW_BACKGROUND_MATERIALS,
	WINDOW_VIBRANCY_OPTIONS,
	type WindowBackgroundMaterial,
	type WindowVibrancy,
} from "@superset/local-db";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type MarkdownStyle,
	SYSTEM_THEME_ID,
	useMarkdownStyle,
	useSetMarkdownStyle,
	useSetTheme,
	useThemeId,
	useThemeStore,
} from "renderer/stores";
import { builtInThemes } from "shared/themes";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { SystemThemeCard } from "./components/SystemThemeCard";
import { ThemeCard } from "./components/ThemeCard";

/** Human-readable labels for vibrancy options */
const VIBRANCY_LABELS: Record<WindowVibrancy, string> = {
	none: "None",
	titlebar: "Title Bar",
	selection: "Selection",
	menu: "Menu",
	popover: "Popover",
	sidebar: "Sidebar",
	header: "Header",
	sheet: "Sheet",
	window: "Window",
	hud: "HUD",
	"fullscreen-ui": "Fullscreen UI",
	tooltip: "Tooltip",
	content: "Content",
	"under-window": "Under Window",
	"under-page": "Under Page",
};

/** Human-readable labels for background material options */
const MATERIAL_LABELS: Record<WindowBackgroundMaterial, string> = {
	none: "None",
	auto: "Auto",
	mica: "Mica",
	acrylic: "Acrylic",
	tabbed: "Tabbed",
};

interface AppearanceSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function AppearanceSettings({ visibleItems }: AppearanceSettingsProps) {
	const showTheme = isItemVisible(
		SETTING_ITEM_ID.APPEARANCE_THEME,
		visibleItems,
	);
	const showMarkdown = isItemVisible(
		SETTING_ITEM_ID.APPEARANCE_MARKDOWN,
		visibleItems,
	);
	const showCustomThemes = isItemVisible(
		SETTING_ITEM_ID.APPEARANCE_CUSTOM_THEMES,
		visibleItems,
	);
	const showWindowOpacity = isItemVisible(
		SETTING_ITEM_ID.APPEARANCE_WINDOW_OPACITY,
		visibleItems,
	);
	const showWindowBlur = isItemVisible(
		SETTING_ITEM_ID.APPEARANCE_WINDOW_BLUR,
		visibleItems,
	);

	const activeThemeId = useThemeId();
	const setTheme = useSetTheme();
	const customThemes = useThemeStore((state) => state.customThemes);
	const markdownStyle = useMarkdownStyle();
	const setMarkdownStyle = useSetMarkdownStyle();

	const allThemes = [...builtInThemes, ...customThemes];

	// Platform detection
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === "darwin";
	const isWindows = platform === "win32";

	// Window opacity
	const utils = electronTrpc.useUtils();
	const { data: windowOpacity } =
		electronTrpc.settings.getWindowOpacity.useQuery();
	const setWindowOpacity = electronTrpc.settings.setWindowOpacity.useMutation({
		onMutate: async ({ opacity }) => {
			await utils.settings.getWindowOpacity.cancel();
			const previous = utils.settings.getWindowOpacity.getData();
			utils.settings.getWindowOpacity.setData(undefined, opacity);
			return { previous };
		},
		onError: (err, _vars, context) => {
			console.error("[appearance/opacity] Failed to save:", err);
			if (context?.previous !== undefined) {
				utils.settings.getWindowOpacity.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.settings.getWindowOpacity.invalidate();
		},
	});
	const applyWindowOpacity = electronTrpc.window.setOpacity.useMutation();

	// Window vibrancy (macOS)
	const { data: windowVibrancy } =
		electronTrpc.settings.getWindowVibrancy.useQuery();
	const setWindowVibrancy = electronTrpc.settings.setWindowVibrancy.useMutation(
		{
			onMutate: async ({ vibrancy }) => {
				await utils.settings.getWindowVibrancy.cancel();
				const previous = utils.settings.getWindowVibrancy.getData();
				utils.settings.getWindowVibrancy.setData(undefined, vibrancy);
				return { previous };
			},
			onError: (err, _vars, context) => {
				console.error("[appearance/vibrancy] Failed to save:", err);
				if (context?.previous !== undefined) {
					utils.settings.getWindowVibrancy.setData(undefined, context.previous);
				}
			},
			onSettled: () => {
				utils.settings.getWindowVibrancy.invalidate();
			},
		},
	);
	const applyWindowVibrancy = electronTrpc.window.setVibrancy.useMutation();

	// Window background material (Windows)
	const { data: windowBackgroundMaterial } =
		electronTrpc.settings.getWindowBackgroundMaterial.useQuery();
	const setWindowBackgroundMaterial =
		electronTrpc.settings.setWindowBackgroundMaterial.useMutation({
			onMutate: async ({ material }) => {
				await utils.settings.getWindowBackgroundMaterial.cancel();
				const previous = utils.settings.getWindowBackgroundMaterial.getData();
				utils.settings.getWindowBackgroundMaterial.setData(undefined, material);
				return { previous };
			},
			onError: (err, _vars, context) => {
				console.error("[appearance/material] Failed to save:", err);
				if (context?.previous !== undefined) {
					utils.settings.getWindowBackgroundMaterial.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getWindowBackgroundMaterial.invalidate();
			},
		});
	const applyWindowBackgroundMaterial =
		electronTrpc.window.setBackgroundMaterial.useMutation();

	const handleOpacityChange = (value: number[]) => {
		const opacity = value[0];
		setWindowOpacity.mutate({ opacity });
		applyWindowOpacity.mutate({ opacity });
	};

	const handleVibrancyChange = (value: string) => {
		const vibrancy = value as WindowVibrancy;
		setWindowVibrancy.mutate({ vibrancy });
		applyWindowVibrancy.mutate({ vibrancy });
	};

	const handleBackgroundMaterialChange = (value: string) => {
		const material = value as WindowBackgroundMaterial;
		setWindowBackgroundMaterial.mutate({ material });
		applyWindowBackgroundMaterial.mutate({ material });
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Appearance</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Customize how Superset looks on your device
				</p>
			</div>

			<div className="space-y-8">
				{/* Theme Section */}
				{showTheme && (
					<div>
						<h3 className="text-sm font-medium mb-4">Theme</h3>
						<div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
							<SystemThemeCard
								isSelected={activeThemeId === SYSTEM_THEME_ID}
								onSelect={() => setTheme(SYSTEM_THEME_ID)}
							/>
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
				)}

				{showMarkdown && (
					<div className={showTheme ? "pt-6 border-t" : ""}>
						<h3 className="text-sm font-medium mb-2">Markdown Style</h3>
						<p className="text-sm text-muted-foreground mb-4">
							Rendering style for markdown files when viewing rendered content
						</p>
						<Select
							value={markdownStyle}
							onValueChange={(value) =>
								setMarkdownStyle(value as MarkdownStyle)
							}
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
							Tufte style uses elegant serif typography inspired by Edward
							Tufte's books
						</p>
					</div>
				)}

				{showCustomThemes && (
					<div className={showTheme || showMarkdown ? "pt-6 border-t" : ""}>
						<h3 className="text-sm font-medium mb-2">Custom Themes</h3>
						<p className="text-sm text-muted-foreground">
							Custom theme import coming soon. You'll be able to import JSON
							theme files to create your own themes.
						</p>
					</div>
				)}

				{/* Window Opacity */}
				{showWindowOpacity && (
					<div
						className={
							showTheme || showMarkdown || showCustomThemes ? "pt-6 border-t" : ""
						}
					>
						<div className="space-y-4">
							<div>
								<Label className="text-sm font-medium">Window Opacity</Label>
								<p className="text-sm text-muted-foreground mt-1">
									Adjust the transparency of the window
								</p>
							</div>
							<div className="flex items-center gap-4">
								<Slider
									value={[windowOpacity ?? 100]}
									min={0}
									max={100}
									step={5}
									onValueChange={handleOpacityChange}
									className="flex-1"
								/>
								<span className="text-sm text-muted-foreground w-12 text-right">
									{windowOpacity ?? 100}%
								</span>
							</div>
							<p className="text-xs text-muted-foreground mt-2">
								Only affects the window frame, not the content inside.
							</p>
						</div>
					</div>
				)}

				{/* Window Blur - Platform-specific */}
				{showWindowBlur && (isMac || isWindows) && (
					<div
						className={
							showTheme || showMarkdown || showCustomThemes || showWindowOpacity
								? "pt-6 border-t"
								: ""
						}
					>
						<h3 className="text-sm font-medium mb-2">Window Blur</h3>
						<p className="text-sm text-muted-foreground mb-4">
							{isMac
								? "Apply a vibrancy effect to the window background"
								: "Apply a material effect to the window background"}
						</p>
						{isMac ? (
							<Select
								value={windowVibrancy ?? "none"}
								onValueChange={handleVibrancyChange}
							>
								<SelectTrigger className="w-[200px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{WINDOW_VIBRANCY_OPTIONS.map((option) => (
										<SelectItem key={option} value={option}>
											{VIBRANCY_LABELS[option]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<Select
								value={windowBackgroundMaterial ?? "none"}
								onValueChange={handleBackgroundMaterialChange}
							>
								<SelectTrigger className="w-[200px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{WINDOW_BACKGROUND_MATERIALS.map((option) => (
										<SelectItem key={option} value={option}>
											{MATERIAL_LABELS[option]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
						{isMac && (
							<p className="text-xs text-muted-foreground mt-2">
								Vibrancy adds a translucent blur effect. "Under Window" and
								"Under Page" are popular choices.
							</p>
						)}
						{isWindows && (
							<p className="text-xs text-muted-foreground mt-2">
								Mica and Acrylic are Windows 11 material effects that add
								background blur.
							</p>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
