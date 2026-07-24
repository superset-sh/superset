import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
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
import { useQueryClient } from "@tanstack/react-query";
import {
	ChevronRight,
	Code2,
	RotateCcw,
	SlidersHorizontal,
	SquareTerminal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveEditorLineHeight } from "renderer/lib/editor-typography";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	FONT_SETTINGS_QUERY_KEY,
	type FontSettings,
} from "renderer/lib/font-settings";
import {
	DEFAULT_TERMINAL_CURSOR_BLINK,
	DEFAULT_TERMINAL_CURSOR_STYLE,
	DEFAULT_TERMINAL_FONT_FAMILY,
	DEFAULT_TERMINAL_FONT_SIZE,
	DEFAULT_TERMINAL_LIGATURES,
	DEFAULT_TERMINAL_LINE_HEIGHT,
	getDefaultTerminalAppearance,
	resolveTerminalAppearance,
} from "renderer/lib/terminal/appearance";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import {
	DEFAULT_CODE_EDITOR_FONT_FAMILY,
	DEFAULT_CODE_EDITOR_FONT_SIZE,
} from "renderer/screens/main/components/WorkspaceView/components/CodeEditor/constants";
import { useTerminalTheme } from "renderer/stores/theme";
import { FontFamilyCombobox } from "./components/FontFamilyCombobox";
import { FontPreview } from "./components/FontPreview";
import { useSystemFonts } from "./hooks/useSystemFonts";
import { toFontWeightOverride } from "./utils/toFontWeightOverride";

type FontSettingKey = keyof FontSettings;
type NumericSettingKey =
	| "terminalFontSize"
	| "terminalLineHeight"
	| "terminalLetterSpacing"
	| "editorFontSize"
	| "editorLineHeight"
	| "editorLetterSpacing";

const EMPTY_FONT_SETTINGS: FontSettings = {
	terminalFontFamily: null,
	terminalFontSize: null,
	terminalLineHeight: null,
	terminalLetterSpacing: null,
	terminalFontWeight: null,
	terminalLigatures: null,
	terminalMinimumContrast: null,
	terminalCursorStyle: null,
	terminalCursorBlink: null,
	editorFontFamily: null,
	editorFontSize: null,
	editorLineHeight: null,
	editorLetterSpacing: null,
	editorFontWeight: null,
	editorLigatures: null,
};

const VARIANT_CONFIG = {
	editor: {
		title: "Editor typography",
		description: "Typography used in V2 editors and diff views.",
		defaultFamily: DEFAULT_CODE_EDITOR_FONT_FAMILY,
		defaultSize: DEFAULT_CODE_EDITOR_FONT_SIZE,
		defaultLineHeight: 1.5,
		familyKey: "editorFontFamily",
		sizeKey: "editorFontSize",
		lineHeightKey: "editorLineHeight",
		letterSpacingKey: "editorLetterSpacing",
		fontWeightKey: "editorFontWeight",
		ligaturesKey: "editorLigatures",
		groupKeys: [
			"editorFontFamily",
			"editorFontSize",
			"editorLineHeight",
			"editorLetterSpacing",
			"editorFontWeight",
			"editorLigatures",
		] satisfies FontSettingKey[],
	},
	terminal: {
		title: "Terminal typography",
		description: "Typography and cursor behavior used in V2 terminal panels.",
		defaultFamily: DEFAULT_TERMINAL_FONT_FAMILY,
		defaultSize: DEFAULT_TERMINAL_FONT_SIZE,
		defaultLineHeight: DEFAULT_TERMINAL_LINE_HEIGHT,
		familyKey: "terminalFontFamily",
		sizeKey: "terminalFontSize",
		lineHeightKey: "terminalLineHeight",
		letterSpacingKey: "terminalLetterSpacing",
		fontWeightKey: "terminalFontWeight",
		ligaturesKey: "terminalLigatures",
		groupKeys: [
			"terminalFontFamily",
			"terminalFontSize",
			"terminalLineHeight",
			"terminalLetterSpacing",
			"terminalFontWeight",
			"terminalLigatures",
			"terminalMinimumContrast",
			"terminalCursorStyle",
			"terminalCursorBlink",
		] satisfies FontSettingKey[],
	},
} as const;

interface FontSettingSectionProps {
	showEditor?: boolean;
	showTerminal?: boolean;
}

export function FontSettingSection({
	showEditor = true,
	showTerminal = true,
}: FontSettingSectionProps) {
	const [variant, setVariant] = useState<"editor" | "terminal">(
		showEditor ? "editor" : "terminal",
	);
	const config = VARIANT_CONFIG[variant];
	const utils = electronTrpc.useUtils();
	const queryClient = useQueryClient();
	const terminalTheme = useTerminalTheme();
	const fallbackTerminalTheme = useMemo(
		() => getDefaultTerminalAppearance().theme,
		[],
	);

	const { data: fontSettings, isLoading } =
		electronTrpc.settings.getFontSettings.useQuery();

	const syncTerminalRuntimes = useCallback(
		(settings: FontSettings) => {
			const appearance = resolveTerminalAppearance(
				terminalTheme ?? fallbackTerminalTheme,
				settings,
			);
			terminalRuntimeRegistry.updateAllAppearances(appearance);
		},
		[terminalTheme, fallbackTerminalTheme],
	);

	const setFontSettings = electronTrpc.settings.setFontSettings.useMutation({
		onMutate: async (input) => {
			await Promise.all([
				utils.settings.getFontSettings.cancel(),
				queryClient.cancelQueries({ queryKey: FONT_SETTINGS_QUERY_KEY }),
			]);
			const previous = utils.settings.getFontSettings.getData();
			const previousV2 = queryClient.getQueryData<FontSettings>(
				FONT_SETTINGS_QUERY_KEY,
			);
			const next = {
				...EMPTY_FONT_SETTINGS,
				...previousV2,
				...previous,
				...input,
			} as FontSettings;
			utils.settings.getFontSettings.setData(undefined, next);
			queryClient.setQueryData(FONT_SETTINGS_QUERY_KEY, next);
			if (Object.keys(input).some((key) => key.startsWith("terminal"))) {
				syncTerminalRuntimes(next);
			}
			return { previous, previousV2 };
		},
		onError: (_err, input, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getFontSettings.setData(undefined, context.previous);
			}
			const rollback = context?.previousV2 ?? context?.previous;
			if (rollback === undefined) {
				queryClient.removeQueries({
					queryKey: FONT_SETTINGS_QUERY_KEY,
					exact: true,
				});
			} else {
				queryClient.setQueryData(FONT_SETTINGS_QUERY_KEY, rollback);
			}
			if (
				rollback !== undefined &&
				Object.keys(input).some((key) => key.startsWith("terminal"))
			) {
				syncTerminalRuntimes({ ...EMPTY_FONT_SETTINGS, ...rollback });
			}
		},
		onSettled: () => {
			void utils.settings.getFontSettings.invalidate();
			void queryClient.invalidateQueries({
				queryKey: FONT_SETTINGS_QUERY_KEY,
			});
		},
	});

	const { fonts: systemFonts, isLoading: fontsLoading } = useSystemFonts();
	const [drafts, setDrafts] = useState<
		Partial<Record<NumericSettingKey, string>>
	>({});
	const [advancedOpen, setAdvancedOpen] = useState(false);

	useEffect(() => {
		if (!showEditor && !showTerminal) return;
		if (variant === "editor" && !showEditor) setVariant("terminal");
		if (variant === "terminal" && !showTerminal) setVariant("editor");
	}, [showEditor, showTerminal, variant]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset in-progress input when persisted or optimistic settings change
	useEffect(() => {
		setDrafts({});
	}, [fontSettings]);

	const settings = useMemo(
		() => ({ ...EMPTY_FONT_SETTINGS, ...fontSettings }),
		[fontSettings],
	);
	const mutateSetting = useCallback(
		(key: FontSettingKey, value: FontSettings[FontSettingKey]) => {
			setFontSettings.mutate({ [key]: value });
		},
		[setFontSettings],
	);

	const numericValue = useCallback(
		(key: NumericSettingKey, fallback: number) => {
			const draft = drafts[key];
			if (draft != null) {
				const parsed = Number.parseFloat(draft);
				if (Number.isFinite(parsed)) return parsed;
			}
			return settings[key] ?? fallback;
		},
		[drafts, settings],
	);

	const commitNumeric = useCallback(
		(key: NumericSettingKey, min: number, max: number, step: number) => {
			const raw = drafts[key];
			if (raw == null) return;
			const value = Number.parseFloat(raw);
			const isStep = Math.abs(value / step - Math.round(value / step)) < 1e-9;
			if (Number.isFinite(value) && value >= min && value <= max && isStep) {
				mutateSetting(key, value);
			}
			setDrafts((current) => {
				const next = { ...current };
				delete next[key];
				return next;
			});
		},
		[drafts, mutateSetting],
	);

	const currentFamily = settings[config.familyKey];
	const editorPreviewSize = numericValue(
		"editorFontSize",
		DEFAULT_CODE_EDITOR_FONT_SIZE,
	);
	const editorPreviewLineHeight =
		drafts.editorLineHeight == null && settings.editorLineHeight == null
			? resolveEditorLineHeight(editorPreviewSize) / editorPreviewSize
			: numericValue("editorLineHeight", 1.5);
	const terminalPreviewSize = numericValue(
		"terminalFontSize",
		DEFAULT_TERMINAL_FONT_SIZE,
	);
	const terminalPreviewLineHeight = numericValue(
		"terminalLineHeight",
		DEFAULT_TERMINAL_LINE_HEIGHT,
	);
	const hasOverrides = config.groupKeys.some((key) => settings[key] !== null);

	const inputValue = (key: NumericSettingKey, fallback: number) =>
		drafts[key] ?? String(settings[key] ?? fallback);

	return (
		<section aria-labelledby="typography-title">
			<div className="mb-3">
				<h3 id="typography-title" className="text-sm font-medium mb-1">
					Typography
				</h3>
				<p className="text-xs text-muted-foreground">
					Select a live surface, then adjust its typography. Changes appear
					immediately.
				</p>
			</div>

			<div className="rounded-lg border bg-card/40 p-4">
				<div className="mb-4 flex items-start justify-between gap-4">
					<div>
						<div className="flex items-center gap-2">
							{variant === "editor" ? (
								<Code2 className="size-4 text-muted-foreground" />
							) : (
								<SquareTerminal className="size-4 text-muted-foreground" />
							)}
							<h4 className="text-sm font-medium">{config.title}</h4>
						</div>
						<p className="mt-1 text-xs text-muted-foreground">
							{config.description}
							{variant === "terminal" && (
								<>
									{" "}
									<a
										href="https://www.nerdfonts.com"
										target="_blank"
										rel="noopener noreferrer"
										className="text-primary hover:underline"
									>
										Nerd Fonts
									</a>{" "}
									are recommended.
								</>
							)}
						</p>
					</div>
					{hasOverrides && (
						<Button
							variant="ghost"
							size="sm"
							className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground"
							onClick={() => {
								setFontSettings.mutate(
									Object.fromEntries(
										config.groupKeys.map((key) => [key, null]),
									),
								);
								setDrafts({});
							}}
						>
							<RotateCcw className="size-3.5" />
							Reset {variant}
						</Button>
					)}
				</div>

				<div>
					<div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
						<div className="space-y-1.5">
							<Label className="text-xs">Font family</Label>
							<FontFamilyCombobox
								value={currentFamily}
								defaultValue={config.defaultFamily}
								onValueChange={(value) =>
									mutateSetting(config.familyKey, value)
								}
								disabled={isLoading}
								variant={variant}
								fonts={systemFonts}
								fontsLoading={fontsLoading}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor={`${variant}-font-size`} className="text-xs">
								Font size
							</Label>
							<div className="relative">
								<Input
									id={`${variant}-font-size`}
									type="number"
									min={10}
									max={24}
									step={0.5}
									value={inputValue(config.sizeKey, config.defaultSize)}
									onChange={(event) =>
										setDrafts((current) => ({
											...current,
											[config.sizeKey]: event.target.value,
										}))
									}
									onBlur={() => commitNumeric(config.sizeKey, 10, 24, 0.5)}
									onKeyDown={(event) => {
										if (event.key === "Enter") event.currentTarget.blur();
									}}
									disabled={isLoading}
									className="pr-7"
									aria-label={`${config.title} font size`}
								/>
								<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
									px
								</span>
							</div>
						</div>
					</div>

					<Collapsible
						open={advancedOpen}
						onOpenChange={setAdvancedOpen}
						className="mt-4"
					>
						<CollapsibleTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className="h-9 w-full justify-between px-3 text-xs font-normal"
							>
								<span className="flex items-center gap-2">
									<SlidersHorizontal className="size-3.5 text-muted-foreground" />
									Fine tune typography
								</span>
								<ChevronRight
									className={`size-3.5 text-muted-foreground transition-transform ${advancedOpen ? "rotate-90" : ""}`}
								/>
							</Button>
						</CollapsibleTrigger>
						<CollapsibleContent className="pt-3">
							<div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label htmlFor={`${variant}-line-height`} className="text-xs">
										Line height
									</Label>
									<Input
										id={`${variant}-line-height`}
										type="number"
										min={1}
										max={2.5}
										step={0.1}
										value={inputValue(
											config.lineHeightKey,
											config.defaultLineHeight,
										)}
										onChange={(event) =>
											setDrafts((current) => ({
												...current,
												[config.lineHeightKey]: event.target.value,
											}))
										}
										onBlur={() =>
											commitNumeric(config.lineHeightKey, 1, 2.5, 0.1)
										}
										onKeyDown={(event) => {
											if (event.key === "Enter") event.currentTarget.blur();
										}}
									/>
								</div>
								<div className="space-y-1.5">
									<Label
										htmlFor={`${variant}-letter-spacing`}
										className="text-xs"
									>
										Letter spacing (px)
									</Label>
									<Input
										id={`${variant}-letter-spacing`}
										type="number"
										min={-2}
										max={4}
										step={0.1}
										value={inputValue(config.letterSpacingKey, 0)}
										onChange={(event) =>
											setDrafts((current) => ({
												...current,
												[config.letterSpacingKey]: event.target.value,
											}))
										}
										onBlur={() =>
											commitNumeric(config.letterSpacingKey, -2, 4, 0.1)
										}
										onKeyDown={(event) => {
											if (event.key === "Enter") event.currentTarget.blur();
										}}
									/>
								</div>
								<div className="space-y-1.5">
									<Label className="text-xs">Font weight</Label>
									<Select
										value={String(settings[config.fontWeightKey] ?? 400)}
										onValueChange={(value) =>
											mutateSetting(
												config.fontWeightKey,
												toFontWeightOverride(value),
											)
										}
									>
										<SelectTrigger size="sm" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{[100, 200, 300, 400, 500, 600, 700, 800, 900].map(
												(weight) => (
													<SelectItem key={weight} value={String(weight)}>
														{weight}
													</SelectItem>
												),
											)}
										</SelectContent>
									</Select>
								</div>
								<div className="flex items-center justify-between gap-3 min-h-14">
									<div>
										<Label htmlFor={`${variant}-ligatures`} className="text-xs">
											Ligatures
										</Label>
										<p className="text-[11px] text-muted-foreground">
											Combine sequences such as =&gt; and !==.
										</p>
									</div>
									<Switch
										id={`${variant}-ligatures`}
										checked={
											settings[config.ligaturesKey] ??
											(variant === "terminal"
												? DEFAULT_TERMINAL_LIGATURES
												: true)
										}
										onCheckedChange={(checked) =>
											mutateSetting(config.ligaturesKey, checked)
										}
									/>
								</div>

								{variant === "terminal" && (
									<>
										<div className="space-y-1.5">
											<Label className="text-xs">Minimum contrast</Label>
											<Select
												value={String(
													settings.terminalMinimumContrast ?? "default",
												)}
												onValueChange={(value) =>
													mutateSetting(
														"terminalMinimumContrast",
														value === "default" ? null : Number(value),
													)
												}
											>
												<SelectTrigger size="sm" className="w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="default">Theme default</SelectItem>
													<SelectItem value="3">3:1</SelectItem>
													<SelectItem value="4.5">4.5:1 (AA)</SelectItem>
													<SelectItem value="7">7:1 (AAA)</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<div className="space-y-1.5">
											<Label className="text-xs">Cursor style</Label>
											<Select
												value={
													settings.terminalCursorStyle ??
													DEFAULT_TERMINAL_CURSOR_STYLE
												}
												onValueChange={(value) =>
													mutateSetting(
														"terminalCursorStyle",
														value as "block" | "bar" | "underline",
													)
												}
											>
												<SelectTrigger size="sm" className="w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="block">Block</SelectItem>
													<SelectItem value="bar">Bar</SelectItem>
													<SelectItem value="underline">Underline</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<div className="flex items-center justify-between gap-3 min-h-14 sm:col-span-2">
											<div>
												<Label
													htmlFor="terminal-cursor-blink"
													className="text-xs"
												>
													Cursor blinking
												</Label>
												<p className="text-[11px] text-muted-foreground">
													Animate the active terminal cursor.
												</p>
											</div>
											<Switch
												id="terminal-cursor-blink"
												checked={
													settings.terminalCursorBlink ??
													DEFAULT_TERMINAL_CURSOR_BLINK
												}
												onCheckedChange={(checked) =>
													mutateSetting("terminalCursorBlink", checked)
												}
											/>
										</div>
									</>
								)}
							</div>
						</CollapsibleContent>
					</Collapsible>
				</div>
			</div>

			<div className="mt-5">
				<div className="mb-3">
					<p className="text-xs font-medium">Live surfaces</p>
					<p className="text-[11px] text-muted-foreground">
						Both previews stay visible. Select either one to edit its settings.
					</p>
				</div>
				<div className="grid gap-5">
					{showEditor && (
						<div>
							<div className="mb-2 flex items-center justify-between gap-3">
								<Button
									variant="ghost"
									size="sm"
									aria-pressed={variant === "editor"}
									className="-ml-2 h-8 gap-2 px-2 text-xs"
									onClick={() => setVariant("editor")}
								>
									<Code2 className="size-3.5" />
									Editor
									{variant === "editor" && (
										<span className="text-primary">Editing</span>
									)}
								</Button>
								<span className="text-[10px] tabular-nums text-muted-foreground">
									{editorPreviewSize}px ·{" "}
									{Number(editorPreviewLineHeight.toFixed(2))} line height
								</span>
							</div>
							<FontPreview
								fontFamily={
									settings.editorFontFamily ?? DEFAULT_CODE_EDITOR_FONT_FAMILY
								}
								fontSize={editorPreviewSize}
								lineHeight={editorPreviewLineHeight}
								letterSpacing={numericValue("editorLetterSpacing", 0)}
								fontWeight={settings.editorFontWeight ?? 400}
								ligatures={settings.editorLigatures ?? true}
								variant="editor"
								isActive={variant === "editor"}
								isCustomFont={settings.editorFontFamily !== null}
							/>
						</div>
					)}

					{showTerminal && (
						<div>
							<div className="mb-2 flex items-center justify-between gap-3">
								<Button
									variant="ghost"
									size="sm"
									aria-pressed={variant === "terminal"}
									className="-ml-2 h-8 gap-2 px-2 text-xs"
									onClick={() => setVariant("terminal")}
								>
									<SquareTerminal className="size-3.5" />
									Terminal
									{variant === "terminal" && (
										<span className="text-primary">Editing</span>
									)}
								</Button>
								<span className="text-[10px] tabular-nums text-muted-foreground">
									{terminalPreviewSize}px ·{" "}
									{Number(terminalPreviewLineHeight.toFixed(2))} line height
								</span>
							</div>
							<FontPreview
								fontFamily={
									settings.terminalFontFamily ?? DEFAULT_TERMINAL_FONT_FAMILY
								}
								fontSize={terminalPreviewSize}
								lineHeight={terminalPreviewLineHeight}
								letterSpacing={numericValue("terminalLetterSpacing", 0)}
								fontWeight={settings.terminalFontWeight ?? 400}
								ligatures={
									settings.terminalLigatures ?? DEFAULT_TERMINAL_LIGATURES
								}
								variant="terminal"
								isActive={variant === "terminal"}
								isCustomFont={settings.terminalFontFamily !== null}
								minimumContrast={settings.terminalMinimumContrast}
								cursorStyle={
									settings.terminalCursorStyle ?? DEFAULT_TERMINAL_CURSOR_STYLE
								}
								cursorBlink={
									settings.terminalCursorBlink ?? DEFAULT_TERMINAL_CURSOR_BLINK
								}
							/>
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
