import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useCallback, useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	DEFAULT_TERMINAL_FONT_FAMILY,
	DEFAULT_TERMINAL_FONT_SIZE,
	DEFAULT_TERMINAL_FONT_WEIGHT,
	DEFAULT_TERMINAL_LINE_HEIGHT,
} from "renderer/lib/terminal/appearance";
import {
	DEFAULT_CODE_EDITOR_FONT_FAMILY,
	DEFAULT_CODE_EDITOR_FONT_SIZE,
	DEFAULT_CODE_EDITOR_FONT_WEIGHT,
	DEFAULT_CODE_EDITOR_LINE_HEIGHT,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/registry/views/CodeView/components/CodeEditor/constants";
import { FontFamilyCombobox } from "./components/FontFamilyCombobox";
import { FontPreview } from "./components/FontPreview";
import { useSystemFonts } from "./hooks/useSystemFonts";

const FONT_WEIGHT_MIN = 100;
const FONT_WEIGHT_MAX = 900;
const FONT_WEIGHT_STEP = 100;
const LINE_HEIGHT_MIN = 1;
const LINE_HEIGHT_MAX = 3;
const LINE_HEIGHT_STEP = 0.1;

const VARIANT_CONFIG = {
	editor: {
		title: "Editor font",
		description:
			"Font used in diff views, file editors, and chat/markdown prose.",
		defaultFamily: DEFAULT_CODE_EDITOR_FONT_FAMILY,
		defaultSize: DEFAULT_CODE_EDITOR_FONT_SIZE,
		defaultWeight: DEFAULT_CODE_EDITOR_FONT_WEIGHT,
		defaultLineHeight: DEFAULT_CODE_EDITOR_LINE_HEIGHT,
		familyKey: "editorFontFamily",
		sizeKey: "editorFontSize",
		weightKey: "editorFontWeight",
		lineHeightKey: "editorLineHeight",
	},
	terminal: {
		title: "Terminal font",
		description: "Font used in terminal panels.",
		defaultFamily: DEFAULT_TERMINAL_FONT_FAMILY,
		defaultSize: DEFAULT_TERMINAL_FONT_SIZE,
		defaultWeight: DEFAULT_TERMINAL_FONT_WEIGHT,
		defaultLineHeight: DEFAULT_TERMINAL_LINE_HEIGHT,
		familyKey: "terminalFontFamily",
		sizeKey: "terminalFontSize",
		weightKey: "terminalFontWeight",
		lineHeightKey: "terminalLineHeight",
	},
} as const;

interface FontSettingSectionProps {
	variant: "editor" | "terminal";
}

export function FontSettingSection({ variant }: FontSettingSectionProps) {
	const config = VARIANT_CONFIG[variant];

	const utils = electronTrpc.useUtils();

	const { data: fontSettings, isLoading } =
		electronTrpc.settings.getFontSettings.useQuery();

	const setFontSettings = electronTrpc.settings.setFontSettings.useMutation({
		onMutate: async (input) => {
			await utils.settings.getFontSettings.cancel();
			const previous = utils.settings.getFontSettings.getData();
			utils.settings.getFontSettings.setData(undefined, (old) => ({
				terminalFontFamily: old?.terminalFontFamily ?? null,
				terminalFontSize: old?.terminalFontSize ?? null,
				terminalFontWeight: old?.terminalFontWeight ?? null,
				terminalLineHeight: old?.terminalLineHeight ?? null,
				editorFontFamily: old?.editorFontFamily ?? null,
				editorFontSize: old?.editorFontSize ?? null,
				editorFontWeight: old?.editorFontWeight ?? null,
				editorLineHeight: old?.editorLineHeight ?? null,
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

	const { fonts: systemFonts, isLoading: fontsLoading } = useSystemFonts();

	const [fontSizeDraft, setFontSizeDraft] = useState<string | null>(null);
	const [fontWeightDraft, setFontWeightDraft] = useState<string | null>(null);
	const [lineHeightDraft, setLineHeightDraft] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: sync draft state when fontSettings changes
	useEffect(() => {
		setFontSizeDraft(null);
		setFontWeightDraft(null);
		setLineHeightDraft(null);
	}, [fontSettings]);

	const currentFamily = fontSettings?.[config.familyKey] ?? null;
	const currentSize = fontSettings?.[config.sizeKey] ?? null;
	const currentWeight = fontSettings?.[config.weightKey] ?? null;
	const currentLineHeight = fontSettings?.[config.lineHeightKey] ?? null;

	const handleFontFamilyChange = useCallback(
		(value: string | null) => {
			setFontSettings.mutate({
				[config.familyKey]: value,
			});
		},
		[setFontSettings, config.familyKey],
	);

	const handleFontSizeBlur = useCallback(
		(e: React.FocusEvent<HTMLInputElement>) => {
			const value = Number.parseInt(e.target.value, 10);
			if (!Number.isNaN(value) && value >= 10 && value <= 24) {
				setFontSettings.mutate({ [config.sizeKey]: value });
			}
		},
		[setFontSettings, config.sizeKey],
	);

	const handleFontWeightBlur = useCallback(
		(e: React.FocusEvent<HTMLInputElement>) => {
			const parsed = Number.parseInt(e.target.value, 10);
			if (Number.isNaN(parsed)) return;
			// Snap to the nearest 100 (matching the step=100 UI). Most fixed-weight
			// fonts only ship 400/700, so an off-step value like 350 would silently
			// clamp to a bucket and appear to do nothing.
			const snapped = Math.round(parsed / FONT_WEIGHT_STEP) * FONT_WEIGHT_STEP;
			const clamped = Math.min(
				FONT_WEIGHT_MAX,
				Math.max(FONT_WEIGHT_MIN, snapped),
			);
			setFontSettings.mutate({ [config.weightKey]: clamped });
		},
		[setFontSettings, config.weightKey],
	);

	const handleLineHeightBlur = useCallback(
		(e: React.FocusEvent<HTMLInputElement>) => {
			const value = Number.parseFloat(e.target.value);
			if (
				!Number.isNaN(value) &&
				value >= LINE_HEIGHT_MIN &&
				value <= LINE_HEIGHT_MAX
			) {
				setFontSettings.mutate({ [config.lineHeightKey]: value });
			}
		},
		[setFontSettings, config.lineHeightKey],
	);

	const previewFamily = currentFamily ?? config.defaultFamily;
	const previewSize =
		(fontSizeDraft != null ? Number.parseInt(fontSizeDraft, 10) : undefined) ||
		currentSize ||
		config.defaultSize;
	const previewWeight =
		(fontWeightDraft != null
			? Number.parseInt(fontWeightDraft, 10)
			: undefined) ||
		currentWeight ||
		config.defaultWeight;
	const previewLineHeight =
		(lineHeightDraft != null
			? Number.parseFloat(lineHeightDraft)
			: undefined) ||
		currentLineHeight ||
		config.defaultLineHeight;

	return (
		<div>
			<h3 className="text-sm font-medium mb-1">{config.title}</h3>
			<p className="text-xs text-muted-foreground mb-3">
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
						recommended for shell theme icons.
					</>
				)}
			</p>
			<div className="flex items-center gap-2">
				<FontFamilyCombobox
					value={currentFamily}
					defaultValue={config.defaultFamily}
					onValueChange={handleFontFamilyChange}
					disabled={isLoading}
					variant={variant}
					fonts={systemFonts}
					fontsLoading={fontsLoading}
				/>
				<Input
					type="number"
					min={10}
					max={24}
					value={fontSizeDraft ?? String(currentSize ?? config.defaultSize)}
					onChange={(e) => setFontSizeDraft(e.target.value)}
					onBlur={(e) => {
						handleFontSizeBlur(e);
						setFontSizeDraft(null);
					}}
					disabled={isLoading}
					className="w-20"
					aria-label={`${config.title} size`}
				/>
				<Input
					type="number"
					min={FONT_WEIGHT_MIN}
					max={FONT_WEIGHT_MAX}
					step={FONT_WEIGHT_STEP}
					value={
						fontWeightDraft ?? String(currentWeight ?? config.defaultWeight)
					}
					onChange={(e) => setFontWeightDraft(e.target.value)}
					onBlur={(e) => {
						handleFontWeightBlur(e);
						setFontWeightDraft(null);
					}}
					disabled={isLoading}
					className="w-20"
					aria-label={`${config.title} weight`}
				/>
				<Input
					type="number"
					min={LINE_HEIGHT_MIN}
					max={LINE_HEIGHT_MAX}
					step={LINE_HEIGHT_STEP}
					value={
						lineHeightDraft ??
						String(currentLineHeight ?? config.defaultLineHeight)
					}
					onChange={(e) => setLineHeightDraft(e.target.value)}
					onBlur={(e) => {
						handleLineHeightBlur(e);
						setLineHeightDraft(null);
					}}
					disabled={isLoading}
					className="w-20"
					aria-label={`${config.title} line height`}
				/>
				{(currentFamily ||
					currentSize ||
					currentWeight ||
					currentLineHeight) && (
					<Button
						variant="outline"
						size="sm"
						className="shrink-0"
						onClick={() => {
							setFontSettings.mutate({
								[config.familyKey]: null,
								[config.sizeKey]: null,
								[config.weightKey]: null,
								[config.lineHeightKey]: null,
							});
							setFontSizeDraft(null);
							setFontWeightDraft(null);
							setLineHeightDraft(null);
						}}
					>
						Reset
					</Button>
				)}
			</div>
			<div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
				<span className="flex-1">Family</span>
				<span className="w-20">Size</span>
				<span className="w-20">Weight</span>
				<span className="w-20">Line height</span>
			</div>
			<p className="mt-1 text-[10px] text-muted-foreground">
				Weight is rounded to the nearest 100 and only takes effect for weights
				the selected font provides.
			</p>
			<div className="mt-3">
				<FontPreview
					fontFamily={previewFamily}
					fontSize={previewSize}
					fontWeight={previewWeight}
					lineHeight={previewLineHeight}
					variant={variant}
					isCustomFont={currentFamily !== null}
				/>
			</div>
		</div>
	);
}
