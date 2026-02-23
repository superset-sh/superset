import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { type ChangeEvent, useRef, useState } from "react";
import { HiOutlineArrowUpTray, HiOutlineTrash } from "react-icons/hi2";
import { useThemeStore } from "renderer/stores";
import { parseThemeConfigFile } from "shared/themes";

const MAX_THEME_FILE_SIZE = 256 * 1024; // 256 KB

export function CustomThemesSection() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isImporting, setIsImporting] = useState(false);
	const customThemes = useThemeStore((state) => state.customThemes);
	const upsertCustomThemes = useThemeStore((state) => state.upsertCustomThemes);
	const removeCustomTheme = useThemeStore((state) => state.removeCustomTheme);

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

	return (
		<div className="space-y-4">
			<div className="space-y-1.5">
				<h3 className="text-sm font-medium">Custom Themes</h3>
				<p className="text-sm text-muted-foreground">
					Import a JSON file with one theme, an array of themes, or
					<code className="mx-1">{`{ themes: [...] }`}</code>.
				</p>
				<p className="text-xs text-muted-foreground">
					Missing UI and terminal colors fall back to Superset defaults for dark
					or light themes.
				</p>
			</div>

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
				onClick={() => fileInputRef.current?.click()}
				disabled={isImporting}
			>
				<HiOutlineArrowUpTray className="h-4 w-4 mr-1.5" />
				{isImporting ? "Importing..." : "Import Theme File"}
			</Button>

			<div className="space-y-2">
				{customThemes.length === 0 ? (
					<p className="text-xs text-muted-foreground">
						No custom themes imported yet.
					</p>
				) : (
					customThemes.map((theme) => (
						<div
							key={theme.id}
							className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
						>
							<div className="min-w-0">
								<div className="text-sm font-medium truncate">{theme.name}</div>
								<div className="text-xs text-muted-foreground truncate">
									{theme.id} • {theme.type}
									{theme.author ? ` • ${theme.author}` : ""}
								</div>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => removeCustomTheme(theme.id)}
							>
								<HiOutlineTrash className="h-4 w-4 mr-1" />
								Remove
							</Button>
						</div>
					))
				)}
			</div>
		</div>
	);
}
