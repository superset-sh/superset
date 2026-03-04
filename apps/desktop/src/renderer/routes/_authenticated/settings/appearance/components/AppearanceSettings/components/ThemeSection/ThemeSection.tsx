import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { type ChangeEvent, useRef, useState } from "react";
import {
	HiOutlineArrowDownTray,
	HiOutlineArrowTopRightOnSquare,
	HiOutlineArrowUpTray,
} from "react-icons/hi2";
import {
	SYSTEM_THEME_ID,
	useSetTheme,
	useThemeId,
	useThemeStore,
} from "renderer/stores";
import {
	builtInThemes,
	getTerminalColors,
	parseThemeConfigFile,
} from "shared/themes";
import { SystemThemeCard } from "../SystemThemeCard";
import { ThemeCard } from "../ThemeCard";

const MAX_THEME_FILE_SIZE = 256 * 1024; // 256 KB

export function ThemeSection() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isImporting, setIsImporting] = useState(false);
	const activeThemeId = useThemeId();
	const setTheme = useSetTheme();
	const activeTheme = useThemeStore((state) => state.activeTheme);
	const customThemes = useThemeStore((state) => state.customThemes);
	const upsertCustomThemes = useThemeStore((state) => state.upsertCustomThemes);

	const allThemes = [...builtInThemes, ...customThemes];

	const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		if (file.size > MAX_THEME_FILE_SIZE) {
			toast.error("Theme file too large", {
				description: "Maximum size is 256 KB.",
			});
			return;
		}

		setIsImporting(true);
		try {
			const content = await file.text();
			const parsed = parseThemeConfigFile(content);

			if (!parsed.ok) {
				toast.error("Failed to import theme file", {
					description: parsed.error,
				});
				return;
			}

			const summary = upsertCustomThemes(parsed.themes);
			const totalImported = summary.added + summary.updated;

			if (totalImported === 0) {
				toast.error("No themes were imported", {
					description:
						summary.skipped > 0
							? "All themes used reserved IDs (built-in or system)."
							: "The file did not contain any importable themes.",
				});
				return;
			}

			toast.success(
				totalImported === 1
					? "Imported 1 custom theme"
					: `Imported ${totalImported} custom themes`,
				{
					description:
						summary.updated > 0
							? `${summary.updated} existing theme${summary.updated === 1 ? "" : "s"} updated`
							: undefined,
				},
			);

			if (parsed.issues.length > 0) {
				toast.warning("Some themes were skipped", {
					description: parsed.issues[0],
				});
			}
		} catch (error) {
			toast.error("Failed to import theme file", {
				description:
					error instanceof Error ? error.message : "Unable to read file",
			});
		} finally {
			setIsImporting(false);
		}
	};

	const handleDownloadBaseTheme = () => {
		const baseTheme = activeTheme ?? builtInThemes[0];
		if (!baseTheme) return;

		const baseConfig = {
			id: "my-custom-theme",
			name: "My Custom Theme",
			type: baseTheme.type,
			author: "You",
			description: "Custom Superset theme",
			ui: baseTheme.ui,
			terminal: getTerminalColors(baseTheme),
		};

		const blob = new Blob([JSON.stringify(baseConfig, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "superset-theme-base.json";
		link.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-2">
				<h3 className="text-sm font-medium">Theme</h3>
				<div className="flex flex-wrap items-center gap-2 justify-end">
					<input
						ref={fileInputRef}
						type="file"
						accept=".json,application/json"
						className="hidden"
						onChange={handleImport}
					/>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onClick={() => fileInputRef.current?.click()}
						disabled={isImporting}
					>
						<HiOutlineArrowUpTray className="mr-1.5 h-4 w-4" />
						{isImporting ? "Importing..." : "Import Theme"}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleDownloadBaseTheme}
					>
						<HiOutlineArrowDownTray className="mr-1.5 h-4 w-4" />
						Download Base File
					</Button>
					<a
						href={`${COMPANY.DOCS_URL}/custom-themes`}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
					>
						Theme docs
						<HiOutlineArrowTopRightOnSquare className="h-3 w-3" />
					</a>
				</div>
			</div>
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
	);
}
