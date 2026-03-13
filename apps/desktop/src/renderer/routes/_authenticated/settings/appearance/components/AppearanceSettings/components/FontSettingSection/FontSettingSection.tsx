import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useCallback, useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	DEFAULT_TERMINAL_FONT_FAMILY,
	DEFAULT_TERMINAL_FONT_SIZE,
} from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/config";
import {
	DEFAULT_CODE_EDITOR_FONT_FAMILY,
	DEFAULT_CODE_EDITOR_FONT_SIZE,
} from "renderer/screens/main/components/WorkspaceView/components/CodeEditor/constants";
import { FontFamilyCombobox } from "./components/FontFamilyCombobox";
import { FontPreview } from "./components/FontPreview";
import { useSystemFonts } from "./hooks/useSystemFonts";

const VARIANT_CONFIG = {
	editor: {
		title: "Editor Font",
		description: "Font used in diff views and file editors",
		defaultFamily: DEFAULT_CODE_EDITOR_FONT_FAMILY,
		defaultSize: DEFAULT_CODE_EDITOR_FONT_SIZE,
		familyKey: "editorFontFamily",
		sizeKey: "editorFontSize",
	},
	terminal: {
		title: "Terminal Font",
		description: "Font used in terminal panels.",
		defaultFamily: DEFAULT_TERMINAL_FONT_FAMILY,
		defaultSize: DEFAULT_TERMINAL_FONT_SIZE,
		familyKey: "terminalFontFamily",
		sizeKey: "terminalFontSize",
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

	const { fonts: systemFonts, isLoading: fontsLoading } = useSystemFonts();

	const [fontSizeDraft, setFontSizeDraft] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: sync draft state when fontSettings changes
	useEffect(() => {
		setFontSizeDraft(null);
	}, [fontSettings]);

	const currentFamily = fontSettings?.[config.familyKey] ?? null;
	const currentSize = fontSettings?.[config.sizeKey] ?? null;

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

	const previewFamily = currentFamily ?? config.defaultFamily;
	const previewSize =
		(fontSizeDraft != null ? Number.parseInt(fontSizeDraft, 10) : undefined) ||
		currentSize ||
		config.defaultSize;

	return (
		<div>
			<h3 className="text-sm font-medium mb-1">{config.title}</h3>
			<p className="text-sm text-muted-foreground mb-3">
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
				/>
				{(currentFamily || currentSize) && (
					<Button
						variant="ghost"
						size="sm"
						className="text-xs text-muted-foreground shrink-0"
						onClick={() => {
							setFontSettings.mutate({
								[config.familyKey]: null,
								[config.sizeKey]: null,
							});
							setFontSizeDraft(null);
						}}
					>
						Reset
					</Button>
				)}
			</div>
			<div className="mt-3">
				<FontPreview
					fontFamily={previewFamily}
					fontSize={previewSize}
					variant={variant}
					isCustomFont={currentFamily !== null}
				/>
			</div>
		</div>
	);
}
