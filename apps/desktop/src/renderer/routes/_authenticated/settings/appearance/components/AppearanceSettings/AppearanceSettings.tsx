import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useCallback, useState } from "react";
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

const DEFAULT_EDITOR_FONT_FAMILY =
	"ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace";
const DEFAULT_EDITOR_FONT_SIZE = 13;
const DEFAULT_TERMINAL_FONT_FAMILY =
	"MesloLGM Nerd Font, MesloLGM NF, Menlo, Monaco, monospace";
const DEFAULT_TERMINAL_FONT_SIZE = 14;

const FONT_PREVIEW_TEXT =
	"The quick brown fox jumps over the lazy dog.\n0O1lI {}[]() => !== +- @#$%";

function FontPreview({
	fontFamily,
	fontSize,
	variant,
}: {
	fontFamily: string;
	fontSize: number;
	variant: "editor" | "terminal";
}) {
	const isTerminal = variant === "terminal";
	return (
		<div
			className={`rounded-md border p-3 ${
				isTerminal ? "bg-[#1e1e1e] text-[#cccccc] border-[#333]" : "bg-muted/50"
			}`}
			style={{
				fontFamily: fontFamily || undefined,
				fontSize: `${fontSize}px`,
				lineHeight: 1.5,
				whiteSpace: "pre-wrap",
			}}
		>
			{FONT_PREVIEW_TEXT}
		</div>
	);
}

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
	const showEditorFont = isItemVisible(
		SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT,
		visibleItems,
	);
	const showTerminalFont = isItemVisible(
		SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT,
		visibleItems,
	);

	const activeThemeId = useThemeId();
	const setTheme = useSetTheme();
	const customThemes = useThemeStore((state) => state.customThemes);
	const markdownStyle = useMarkdownStyle();
	const setMarkdownStyle = useSetMarkdownStyle();

	const allThemes = [...builtInThemes, ...customThemes];

	const utils = electronTrpc.useUtils();

	const { data: fontSettings, isLoading: isFontLoading } =
		electronTrpc.settings.getFontSettings.useQuery();

	const setFontSettings = electronTrpc.settings.setFontSettings.useMutation({
		onMutate: async (input) => {
			await utils.settings.getFontSettings.cancel();
			const previous = utils.settings.getFontSettings.getData();
			utils.settings.getFontSettings.setData(undefined, (old) => ({
				terminalFontFamily: old?.terminalFontFamily ?? null,
				terminalFontSize: old?.terminalFontSize ?? null,
				editorFontFamily: old?.editorFontFamily ?? null,
				editorFontSize: old?.editorFontSize ?? null,
				...input,
			}));
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getFontSettings.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.settings.getFontSettings.invalidate();
		},
	});

	const handleEditorFontFamilyBlur = useCallback(
		(e: React.FocusEvent<HTMLInputElement>) => {
			const value = e.target.value.trim();
			setFontSettings.mutate({
				editorFontFamily: value || null,
			});
		},
		[setFontSettings],
	);

	const handleEditorFontSizeChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = Number.parseInt(e.target.value, 10);
			if (!Number.isNaN(value) && value >= 10 && value <= 24) {
				setFontSettings.mutate({ editorFontSize: value });
			}
		},
		[setFontSettings],
	);

	const handleTerminalFontFamilyBlur = useCallback(
		(e: React.FocusEvent<HTMLInputElement>) => {
			const value = e.target.value.trim();
			setFontSettings.mutate({
				terminalFontFamily: value || null,
			});
		},
		[setFontSettings],
	);

	const handleTerminalFontSizeChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = Number.parseInt(e.target.value, 10);
			if (!Number.isNaN(value) && value >= 10 && value <= 24) {
				setFontSettings.mutate({ terminalFontSize: value });
			}
		},
		[setFontSettings],
	);

	const [editorFontDraft, setEditorFontDraft] = useState<string | null>(null);
	const [terminalFontDraft, setTerminalFontDraft] = useState<string | null>(
		null,
	);

	const editorPreviewFamily =
		editorFontDraft ??
		fontSettings?.editorFontFamily ??
		DEFAULT_EDITOR_FONT_FAMILY;
	const editorPreviewSize =
		fontSettings?.editorFontSize ?? DEFAULT_EDITOR_FONT_SIZE;
	const terminalPreviewFamily =
		terminalFontDraft ??
		fontSettings?.terminalFontFamily ??
		DEFAULT_TERMINAL_FONT_FAMILY;
	const terminalPreviewSize =
		fontSettings?.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE;

	const hasPrecedingSection = showTheme || showMarkdown;

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

				{showEditorFont && (
					<div className={hasPrecedingSection ? "pt-6 border-t" : ""}>
						<h3 className="text-sm font-medium mb-1">Editor Font</h3>
						<p className="text-sm text-muted-foreground mb-3">
							Font used in diff views and file editors
						</p>
						<div className="flex items-center gap-2">
							<Input
								placeholder={DEFAULT_EDITOR_FONT_FAMILY}
								defaultValue={fontSettings?.editorFontFamily ?? ""}
								onChange={(e) => setEditorFontDraft(e.target.value)}
								onBlur={(e) => {
									handleEditorFontFamilyBlur(e);
									setEditorFontDraft(null);
								}}
								disabled={isFontLoading}
								className="flex-1"
							/>
							<Input
								type="number"
								min={10}
								max={24}
								value={fontSettings?.editorFontSize ?? DEFAULT_EDITOR_FONT_SIZE}
								onChange={handleEditorFontSizeChange}
								disabled={isFontLoading}
								className="w-20"
							/>
							{(fontSettings?.editorFontFamily ||
								fontSettings?.editorFontSize) && (
								<Button
									variant="ghost"
									size="sm"
									className="text-xs text-muted-foreground shrink-0"
									onClick={() => {
										setFontSettings.mutate({
											editorFontFamily: null,
											editorFontSize: null,
										});
										setEditorFontDraft(null);
									}}
								>
									Reset
								</Button>
							)}
						</div>
						<div className="mt-3">
							<FontPreview
								fontFamily={editorPreviewFamily}
								fontSize={editorPreviewSize}
								variant="editor"
							/>
						</div>
					</div>
				)}

				{showTerminalFont && (
					<div
						className={
							hasPrecedingSection || showEditorFont ? "pt-6 border-t" : ""
						}
					>
						<h3 className="text-sm font-medium mb-1">Terminal Font</h3>
						<p className="text-sm text-muted-foreground mb-3">
							Font used in terminal panels. Nerd Fonts recommended for shell
							theme icons.
						</p>
						<div className="flex items-center gap-2">
							<Input
								placeholder={DEFAULT_TERMINAL_FONT_FAMILY}
								defaultValue={fontSettings?.terminalFontFamily ?? ""}
								onChange={(e) => setTerminalFontDraft(e.target.value)}
								onBlur={(e) => {
									handleTerminalFontFamilyBlur(e);
									setTerminalFontDraft(null);
								}}
								disabled={isFontLoading}
								className="flex-1"
							/>
							<Input
								type="number"
								min={10}
								max={24}
								value={
									fontSettings?.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE
								}
								onChange={handleTerminalFontSizeChange}
								disabled={isFontLoading}
								className="w-20"
							/>
							{(fontSettings?.terminalFontFamily ||
								fontSettings?.terminalFontSize) && (
								<Button
									variant="ghost"
									size="sm"
									className="text-xs text-muted-foreground shrink-0"
									onClick={() => {
										setFontSettings.mutate({
											terminalFontFamily: null,
											terminalFontSize: null,
										});
										setTerminalFontDraft(null);
									}}
								>
									Reset
								</Button>
							)}
						</div>
						<div className="mt-3">
							<FontPreview
								fontFamily={terminalPreviewFamily}
								fontSize={terminalPreviewSize}
								variant="terminal"
							/>
						</div>
					</div>
				)}

				{showCustomThemes && (
					<div
						className={
							hasPrecedingSection || showEditorFont || showTerminalFont
								? "pt-6 border-t"
								: ""
						}
					>
						<h3 className="text-sm font-medium mb-2">Custom Themes</h3>
						<p className="text-sm text-muted-foreground">
							Custom theme import coming soon. You'll be able to import JSON
							theme files to create your own themes.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
