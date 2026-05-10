import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { type ChangeEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	HiOutlineArrowDownTray,
	HiOutlineArrowTopRightOnSquare,
	HiOutlineArrowUpTray,
} from "react-icons/hi2";
import {
	SYSTEM_THEME_ID,
	useSetSystemThemePreference,
	useSetTheme,
	useSystemDarkThemeId,
	useSystemLightThemeId,
	useThemeId,
	useThemeStore,
} from "renderer/stores";
import {
	builtInThemes,
	darkTheme as defaultDarkTheme,
	lightTheme as defaultLightTheme,
	getTerminalColors,
	parseThemeConfigFile,
	type Theme,
} from "shared/themes";

const MAX_THEME_FILE_SIZE = 256 * 1024; // 256 KB

function ThemeSwatch({ theme }: { theme: Theme }) {
	const terminal = getTerminalColors(theme);
	const isDark = theme.type === "dark";
	return (
		<div
			className="flex h-5 w-7 shrink-0 items-center justify-center gap-1 rounded-sm font-semibold"
			style={{
				backgroundColor: terminal.background,
				boxShadow: "inset 0 0 0 0.5px rgba(128, 128, 128, 0.3)",
			}}
		>
			<span
				className="h-1 w-1 rounded-full"
				style={{ backgroundColor: terminal.green }}
			/>
			<span
				className="text-[9px] leading-none"
				style={{ color: isDark ? "#fff" : "#000", opacity: 0.9 }}
			>
				Aa
			</span>
		</div>
	);
}

function ThemeOptionRow({ theme }: { theme: Theme }) {
	return (
		<div className="flex items-center gap-2 min-w-0">
			<ThemeSwatch theme={theme} />
			<span className="truncate">{theme.name}</span>
		</div>
	);
}

interface ThemeRowProps {
	label: string;
	hint: React.ReactNode;
	value: string;
	onValueChange: (value: string) => void;
	currentTheme: Theme;
	options: ReadonlyArray<{ group: string; themes: Theme[] }>;
	includeSystem?: {
		darkTheme: Theme;
		lightTheme: Theme;
	};
}

function ThemeRow({
	label,
	hint,
	value,
	onValueChange,
	currentTheme,
	options,
	includeSystem,
}: ThemeRowProps) {
	const { t } = useTranslation();
	const isSystem = includeSystem !== undefined && value === SYSTEM_THEME_ID;
	return (
		<div className="flex items-center justify-between gap-6 p-4">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">{label}</div>
				<div className="text-xs text-muted-foreground">{hint}</div>
			</div>
			<Select value={value} onValueChange={onValueChange}>
				<SelectTrigger size="sm" className="w-auto min-w-44 px-2">
					<SelectValue>
						{isSystem ? (
							<div className="flex items-center gap-2 min-w-0">
								<div className="flex shrink-0 -space-x-1">
									<ThemeSwatch theme={includeSystem.lightTheme} />
									<ThemeSwatch theme={includeSystem.darkTheme} />
								</div>
								<span className="truncate text-xs">
									{t("settings.appearance.theme.system")}
								</span>
							</div>
						) : (
							<div className="flex items-center gap-2 min-w-0">
								<ThemeSwatch theme={currentTheme} />
								<span className="truncate text-xs">{currentTheme.name}</span>
							</div>
						)}
					</SelectValue>
				</SelectTrigger>
				<SelectContent className="max-h-[320px]">
					{includeSystem && (
						<>
							<SelectItem value={SYSTEM_THEME_ID}>
								<div className="flex items-center gap-2 min-w-0">
									<div className="flex shrink-0 -space-x-1">
										<ThemeSwatch theme={includeSystem.lightTheme} />
										<ThemeSwatch theme={includeSystem.darkTheme} />
									</div>
									<span className="truncate">System</span>
								</div>
							</SelectItem>
							<SelectSeparator />
						</>
					)}
					{options.map((group, idx) => (
						<SelectGroup key={group.group}>
							{idx > 0 && <SelectSeparator />}
							<SelectLabel className="text-xs text-muted-foreground">
								{group.group}
							</SelectLabel>
							{group.themes.map((theme) => (
								<SelectItem key={theme.id} value={theme.id}>
									<ThemeOptionRow theme={theme} />
								</SelectItem>
							))}
						</SelectGroup>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export function ThemeSection() {
	const { t } = useTranslation();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isImporting, setIsImporting] = useState(false);
	const activeThemeId = useThemeId();
	const setTheme = useSetTheme();
	const activeTheme = useThemeStore((state) => state.activeTheme);
	const customThemes = useThemeStore((state) => state.customThemes);
	const upsertCustomThemes = useThemeStore((state) => state.upsertCustomThemes);
	const systemLightThemeId = useSystemLightThemeId();
	const systemDarkThemeId = useSystemDarkThemeId();
	const setSystemThemePreference = useSetSystemThemePreference();

	const allThemes = [...builtInThemes, ...customThemes];
	const lightThemes = allThemes.filter((t) => t.type === "light");
	const darkThemes = allThemes.filter((t) => t.type === "dark");
	const builtInLightThemes = lightThemes.filter((t) => !t.isCustom);
	const builtInDarkThemes = darkThemes.filter((t) => !t.isCustom);
	const customLightThemes = lightThemes.filter((t) => t.isCustom);
	const customDarkThemes = darkThemes.filter((t) => t.isCustom);

	const lightLabel = t("settings.appearance.theme.groups.light");
	const darkLabel = t("settings.appearance.theme.groups.dark");
	const customLabel = t("settings.appearance.theme.groups.custom");
	const allOptions: ReadonlyArray<{ group: string; themes: Theme[] }> = [
		{ group: lightLabel, themes: builtInLightThemes },
		{ group: darkLabel, themes: builtInDarkThemes },
		...(customThemes.length > 0
			? [
					{
						group: customLabel,
						themes: [...customLightThemes, ...customDarkThemes],
					},
				]
			: []),
	];
	const lightOptions: ReadonlyArray<{ group: string; themes: Theme[] }> =
		customLightThemes.length > 0
			? [
					{ group: lightLabel, themes: builtInLightThemes },
					{ group: customLabel, themes: customLightThemes },
				]
			: [{ group: lightLabel, themes: builtInLightThemes }];
	const darkOptions: ReadonlyArray<{ group: string; themes: Theme[] }> =
		customDarkThemes.length > 0
			? [
					{ group: darkLabel, themes: builtInDarkThemes },
					{ group: customLabel, themes: customDarkThemes },
				]
			: [{ group: darkLabel, themes: builtInDarkThemes }];

	const systemLightTheme =
		allThemes.find((t) => t.id === systemLightThemeId) ??
		builtInThemes.find((t) => t.id === "light") ??
		defaultLightTheme;
	const systemDarkTheme =
		allThemes.find((t) => t.id === systemDarkThemeId) ??
		builtInThemes.find((t) => t.id === "dark") ??
		defaultDarkTheme;

	const isSystemMode = activeThemeId === SYSTEM_THEME_ID;
	const currentTheme =
		allThemes.find((t) => t.id === activeThemeId) ?? systemDarkTheme;

	const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		if (file.size > MAX_THEME_FILE_SIZE) {
			toast.error(t("settings.appearance.theme.toast.tooLarge"), {
				description: t("settings.appearance.theme.toast.tooLargeDesc"),
			});
			return;
		}

		setIsImporting(true);
		try {
			const content = await file.text();
			const parsed = parseThemeConfigFile(content);

			if (!parsed.ok) {
				toast.error(t("settings.appearance.theme.toast.importFailed"), {
					description: parsed.error,
				});
				return;
			}

			const summary = upsertCustomThemes(parsed.themes);
			const totalImported = summary.added + summary.updated;

			if (totalImported === 0) {
				toast.error(t("settings.appearance.theme.toast.noneImported"), {
					description:
						summary.skipped > 0
							? t("settings.appearance.theme.toast.reservedIds")
							: t("settings.appearance.theme.toast.emptyFile"),
				});
				return;
			}

			toast.success(
				totalImported === 1
					? t("settings.appearance.theme.toast.importedOne")
					: t("settings.appearance.theme.toast.importedMany", {
							count: totalImported,
						}),
				{
					description:
						summary.updated > 0
							? summary.updated === 1
								? t("settings.appearance.theme.toast.updatedOne")
								: t("settings.appearance.theme.toast.updatedMany", {
										count: summary.updated,
									})
							: undefined,
				},
			);

			if (parsed.issues.length > 0) {
				toast.warning(t("settings.appearance.theme.toast.someSkipped"), {
					description: parsed.issues[0],
				});
			}
		} catch (error) {
			toast.error(t("settings.appearance.theme.toast.importFailed"), {
				description:
					error instanceof Error
						? error.message
						: t("settings.appearance.theme.toast.unableToRead"),
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
		<div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
			<ThemeRow
				label={t("settings.appearance.theme.label")}
				hint={
					<>
						Pick a theme or follow your system appearance. Browse the{" "}
						<a
							href={`${COMPANY.MARKETING_URL}/marketplace/themes`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-0.5 text-primary hover:underline"
						>
							marketplace
							<HiOutlineArrowTopRightOnSquare className="h-3 w-3" />
						</a>{" "}
						or{" "}
						<a
							href={`${COMPANY.DOCS_URL}/custom-themes`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-0.5 text-primary hover:underline"
						>
							docs
							<HiOutlineArrowTopRightOnSquare className="h-3 w-3" />
						</a>
						.
					</>
				}
				value={activeThemeId}
				onValueChange={setTheme}
				currentTheme={currentTheme}
				options={allOptions}
				includeSystem={{
					darkTheme: systemDarkTheme,
					lightTheme: systemLightTheme,
				}}
			/>
			{isSystemMode && (
				<>
					<ThemeRow
						label={t("settings.appearance.theme.lightTheme.label")}
						hint={t("settings.appearance.theme.lightTheme.hint")}
						value={systemLightThemeId}
						onValueChange={(id) => setSystemThemePreference("light", id)}
						currentTheme={systemLightTheme}
						options={lightOptions}
					/>
					<ThemeRow
						label={t("settings.appearance.theme.darkTheme.label")}
						hint={t("settings.appearance.theme.darkTheme.hint")}
						value={systemDarkThemeId}
						onValueChange={(id) => setSystemThemePreference("dark", id)}
						currentTheme={systemDarkTheme}
						options={darkOptions}
					/>
				</>
			)}
			<div className="flex items-center justify-between gap-6 p-4">
				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium">
						{t("settings.appearance.theme.custom.label")}
					</div>
					<div className="text-xs text-muted-foreground">
						{t("settings.appearance.theme.custom.hint")}
					</div>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<input
						ref={fileInputRef}
						type="file"
						accept=".json,application/json"
						className="hidden"
						onChange={handleImport}
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleDownloadBaseTheme}
					>
						<HiOutlineArrowDownTray className="mr-1.5 h-4 w-4" />
						{t("settings.appearance.theme.custom.download")}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => fileInputRef.current?.click()}
						disabled={isImporting}
					>
						<HiOutlineArrowUpTray className="mr-1.5 h-4 w-4" />
						{isImporting
							? t("settings.appearance.theme.custom.importing")
							: t("settings.appearance.theme.custom.import")}
					</Button>
				</div>
			</div>
		</div>
	);
}
