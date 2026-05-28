import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { HiMagnifyingGlass } from "react-icons/hi2";
import {
	HOTKEYS,
	type HotkeyCategory,
	type HotkeyId,
	type ShortcutBinding,
	useFormatBinding,
	useHotkeyDisplay,
	useHotkeyOverridesStore,
	useKeyboardPreferencesStore,
	useRecordHotkeys,
} from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	LEGACY_VOICE_SHORTCUT_SECTION_ID,
	VOICE_INPUT_HOTKEY_ID,
	VOICE_INPUT_SETTINGS_HREF,
	VOICE_INPUT_SETTINGS_SECTION_ID,
	VOICE_SHORTCUT_SECTION_ID,
} from "../utils/voice-shortcut-links";

type PendingHotkeyConflict = {
	targetId: HotkeyId;
	binding: ShortcutBinding;
	conflictId: HotkeyId;
};

const CATEGORY_ORDER: HotkeyCategory[] = [
	"Voice Control",
	"Navigation",
	"Workspace",
	"Terminal",
	"Layout",
	"Window",
	"Help",
];
const RECORDING_SHORTCUT_HINT =
	"Press the shortcut to assign it. Fn/Globe works when pressed by itself.";

function HotkeyRow({
	id,
	label,
	description,
	disabled = false,
	disabledReason,
	isRecording,
	isFocused,
	recordingHint,
	onStartRecording,
	onReset,
}: {
	id: HotkeyId;
	label: string;
	description?: string;
	disabled?: boolean;
	disabledReason?: string;
	isRecording: boolean;
	isFocused: boolean;
	recordingHint?: string;
	onStartRecording: () => void;
	onReset: () => void;
}) {
	const { keys } = useHotkeyDisplay(id);
	const rowTestId = `keyboard-shortcut-row-${id}`;

	return (
		<div
			data-testid={rowTestId}
			data-disabled-shortcut={disabled ? "true" : undefined}
			data-focused-shortcut={isFocused ? "true" : undefined}
			aria-disabled={disabled || undefined}
			className={cn(
				"flex items-center justify-between gap-4 py-3 px-4 transition-colors",
				isRecording && "bg-destructive/5",
				isFocused && "bg-accent/30",
				disabled && "opacity-60",
			)}
		>
			<div className="flex flex-col">
				<span className="text-sm text-foreground">{label}</span>
				{description && (
					<span className="text-xs text-muted-foreground">{description}</span>
				)}
				{disabledReason && (
					<span className="text-xs text-muted-foreground">
						{disabledReason}
					</span>
				)}
				{isRecording && recordingHint ? (
					<span
						className="text-xs text-muted-foreground"
						data-testid={`${rowTestId}-recording-hint`}
					>
						{recordingHint}
					</span>
				) : null}
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					aria-label={`Record shortcut for ${label}`}
					data-testid={`${rowTestId}-record`}
					disabled={disabled}
					onClick={disabled ? undefined : onStartRecording}
					className={cn(
						"h-7 px-3 rounded-md border text-xs transition-colors",
						disabled
							? "border-border bg-muted text-muted-foreground cursor-not-allowed"
							: isRecording
								? "border-destructive/50 bg-destructive/10 text-destructive ring-2 ring-destructive/20"
								: "border-border bg-accent/20 text-foreground hover:bg-accent/40",
					)}
				>
					{isRecording ? (
						<span>Press a key…</span>
					) : (
						<KbdGroup>
							{keys.map((key) => (
								<Kbd key={key}>{key}</Kbd>
							))}
						</KbdGroup>
					)}
				</button>
				<Button
					aria-label={`Reset shortcut for ${label}`}
					data-testid={`${rowTestId}-reset`}
					variant="ghost"
					size="sm"
					disabled={disabled}
					onClick={disabled ? undefined : onReset}
				>
					Reset
				</Button>
			</div>
		</div>
	);
}

export type KeyboardSettingsSearch = {
	section?: string;
	shortcut?: HotkeyId;
};

export const Route = createFileRoute("/_authenticated/settings/keyboard/")({
	component: KeyboardShortcutsRoutePage,
	validateSearch: (
		search: Record<string, unknown>,
	): KeyboardSettingsSearch => ({
		section: typeof search.section === "string" ? search.section : undefined,
		shortcut:
			typeof search.shortcut === "string" && search.shortcut in HOTKEYS
				? (search.shortcut as HotkeyId)
				: undefined,
	}),
});

function KeyboardShortcutsRoutePage() {
	const navigate = Route.useNavigate();
	const { section, shortcut } = Route.useSearch();

	return (
		<KeyboardShortcutsPage
			deepLinkTarget={{
				sectionId: section ?? null,
				shortcutId: shortcut ?? null,
			}}
			onVoiceSettingsNavigate={() => {
				navigate({
					to: "/settings/behavior",
					search: {
						section: VOICE_INPUT_SETTINGS_SECTION_ID,
					},
				});
			}}
		/>
	);
}

function buildHotkeyConflictPrompt({
	conflictDisplayText,
	conflictId,
}: {
	conflictDisplayText: string;
	conflictId: HotkeyId;
}) {
	const assignmentDescription = `${conflictDisplayText} is already assigned to "${
		HOTKEYS[conflictId].label
	}".`;
	const question = "Would you like to reassign it?";
	return {
		title: "Shortcut already in use",
		assignmentDescription,
		question,
		description: `${assignmentDescription} ${question}`,
	};
}

function getHotkeysByCategory(): Record<
	HotkeyCategory,
	Array<{ id: HotkeyId; label: string; description?: string }>
> {
	const grouped: Record<
		HotkeyCategory,
		Array<{ id: HotkeyId; label: string; description?: string }>
	> = {
		"Voice Control": [],
		Navigation: [],
		Workspace: [],
		Layout: [],
		Terminal: [],
		Window: [],
		Help: [],
	};
	for (const [id, hotkey] of Object.entries(HOTKEYS)) {
		grouped[hotkey.category as HotkeyCategory].push({
			id: id as HotkeyId,
			label: hotkey.label,
			description: hotkey.description,
		});
	}
	return grouped;
}

const hotkeysByCategory = getHotkeysByCategory();

type KeyboardDeepLinkTarget = {
	sectionId: string | null;
	shortcutId: HotkeyId | null;
};

type KeyboardShortcutsPageProps = {
	deepLinkTarget?: KeyboardDeepLinkTarget;
	onVoiceSettingsNavigate?: () => void;
};

function getKeyboardDeepLinkTarget(): KeyboardDeepLinkTarget {
	if (typeof window === "undefined") {
		return { sectionId: null, shortcutId: null };
	}

	const hashQueryIndex = window.location.hash.indexOf("?");
	const hashSearch =
		hashQueryIndex >= 0 ? window.location.hash.slice(hashQueryIndex + 1) : "";
	const params = new URLSearchParams(
		hashSearch || window.location.search.slice(1),
	);
	const sectionId = params.get("section");
	const shortcutId = params.get("shortcut");
	if (shortcutId && shortcutId in HOTKEYS) {
		return { sectionId, shortcutId: shortcutId as HotkeyId };
	}

	return { sectionId, shortcutId: null };
}

export function KeyboardShortcutsPage({
	deepLinkTarget: initialDeepLinkTarget,
	onVoiceSettingsNavigate,
}: KeyboardShortcutsPageProps = {}) {
	const voiceShortcutSectionRef = useRef<HTMLDivElement>(null);
	const [deepLinkTarget] = useState<KeyboardDeepLinkTarget>(
		() => initialDeepLinkTarget ?? getKeyboardDeepLinkTarget(),
	);
	const shouldFocusVoiceShortcut =
		deepLinkTarget.sectionId === VOICE_SHORTCUT_SECTION_ID ||
		deepLinkTarget.sectionId === LEGACY_VOICE_SHORTCUT_SECTION_ID ||
		deepLinkTarget.shortcutId === VOICE_INPUT_HOTKEY_ID;
	const focusedShortcutId = shouldFocusVoiceShortcut
		? VOICE_INPUT_HOTKEY_ID
		: deepLinkTarget.shortcutId;
	const [searchQuery, setSearchQuery] = useState(() =>
		focusedShortcutId && !shouldFocusVoiceShortcut
			? HOTKEYS[focusedShortcutId].label
			: "",
	);
	const [recordingId, setRecordingId] = useState<HotkeyId | null>(null);
	const [pendingConflict, setPendingConflict] =
		useState<PendingHotkeyConflict | null>(null);
	const { data: voiceInputEnabled, isLoading: isVoiceInputLoading } =
		electronTrpc.settings.getVoiceInputEnabled.useQuery();
	const isVoiceShortcutDisabled =
		isVoiceInputLoading || voiceInputEnabled !== true;
	const voiceShortcutDisabledReason = isVoiceInputLoading
		? "Checking voice control setting"
		: voiceInputEnabled
			? undefined
			: "Voice control is off";

	const resetOverride = useHotkeyOverridesStore((s) => s.resetOverride);
	const resetAll = useHotkeyOverridesStore((s) => s.resetAll);
	const setOverride = useHotkeyOverridesStore((s) => s.setOverride);

	const adaptiveLayoutEnabled = useKeyboardPreferencesStore(
		(s) => s.adaptiveLayoutEnabled,
	);
	const setAdaptiveLayoutEnabled = useKeyboardPreferencesStore(
		(s) => s.setAdaptiveLayoutEnabled,
	);

	useRecordHotkeys(recordingId, {
		// New printable bindings follow the printed character (matches what the
		// user sees on their keyboard). F-keys / named keys are forced to
		// "named" by the recorder regardless of this preference.
		preferredMode: "logical",
		onSave: () => setRecordingId(null),
		onCancel: () => setRecordingId(null),
		onUnassign: () => setRecordingId(null),
		onConflict: (targetId, binding, conflictId) => {
			setPendingConflict({ targetId, binding, conflictId });
			setRecordingId(null);
		},
		onReserved: (_binding, info) => {
			if (info.severity === "error") {
				toast.error(info.reason);
				setRecordingId(null);
			} else {
				toast.warning(info.reason);
			}
		},
		onUnsupported: (info) => {
			toast.error(info.reason);
		},
	});

	const { keys: showHotkeysKeys } = useHotkeyDisplay("SHOW_HOTKEYS");

	const filteredHotkeysByCategory = useMemo(() => {
		if (!searchQuery) return hotkeysByCategory;
		const lower = searchQuery.toLowerCase();
		return Object.fromEntries(
			CATEGORY_ORDER.map((category) => [
				category,
				(hotkeysByCategory[category] ?? []).filter((hotkey) => {
					const searchableText = [
						category,
						hotkey.label,
						hotkey.description ?? "",
					]
						.join(" ")
						.toLowerCase();
					return searchableText.includes(lower);
				}),
			]),
		) as typeof hotkeysByCategory;
	}, [searchQuery]);
	const handleStartRecording = (id: HotkeyId) => {
		if (id === VOICE_INPUT_HOTKEY_ID && isVoiceShortcutDisabled) {
			return;
		}
		setRecordingId((current) => (current === id ? null : id));
	};

	const handleConflictReassign = () => {
		if (!pendingConflict) {
			return;
		}
		setOverride(pendingConflict.conflictId, null);
		setOverride(pendingConflict.targetId, pendingConflict.binding);
		setPendingConflict(null);
	};

	const handleVoiceSettingsClick = (event: MouseEvent<HTMLAnchorElement>) => {
		if (!onVoiceSettingsNavigate) {
			return;
		}
		event.preventDefault();
		onVoiceSettingsNavigate();
	};

	const conflictDisplay = useFormatBinding(pendingConflict?.binding ?? null);
	const conflictPrompt = pendingConflict
		? buildHotkeyConflictPrompt({
				conflictDisplayText: conflictDisplay.text,
				conflictId: pendingConflict.conflictId,
			})
		: null;

	useEffect(() => {
		if (!shouldFocusVoiceShortcut) return;
		voiceShortcutSectionRef.current?.scrollIntoView?.({
			behavior: "smooth",
			block: "start",
		});
	}, [shouldFocusVoiceShortcut]);

	return (
		<div className="p-6 max-w-4xl w-full">
			{/* Header */}
			<div className="mb-6 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold">Keyboard shortcuts</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Customize keyboard shortcuts for your workflow. Press{" "}
						<KbdGroup>
							{showHotkeysKeys.map((key) => (
								<Kbd key={key}>{key}</Kbd>
							))}
						</KbdGroup>{" "}
						to open this page anytime.
					</p>
				</div>
				<Button
					data-testid="keyboard-shortcuts-reset-all"
					variant="outline"
					size="sm"
					onClick={() => {
						setRecordingId(null);
						resetAll();
					}}
				>
					Reset all
				</Button>
			</div>

			{/* Preferences */}
			<div className="mb-8 flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="adaptive-layout" className="text-sm font-medium">
						Adaptive layout mapping
					</Label>
					<p className="text-xs text-muted-foreground">
						Match shortcuts to the labels on your keyboard (e.g. ⌘Z always fires
						on the key labeled "Z" — physical KeyY on QWERTZ). When off,
						shortcuts are anchored to physical key positions and ignore the
						current input source.
					</p>
				</div>
				<Switch
					id="adaptive-layout"
					data-testid="keyboard-shortcuts-adaptive-layout"
					checked={adaptiveLayoutEnabled}
					onCheckedChange={setAdaptiveLayoutEnabled}
				/>
			</div>

			{/* Search */}
			<div className="relative mb-6">
				<HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					data-testid="keyboard-shortcuts-search"
					type="text"
					placeholder="Search"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					className="pl-9 bg-accent/30 border-transparent focus:border-accent"
				/>
			</div>

			{/* Tables by Category */}
			<div className="space-y-6">
				{CATEGORY_ORDER.map((category) => {
					const hotkeys = filteredHotkeysByCategory[category] ?? [];
					if (hotkeys.length === 0) return null;
					const isVoiceControlCategory = category === "Voice Control";

					return (
						<div
							key={category}
							ref={isVoiceControlCategory ? voiceShortcutSectionRef : undefined}
							id={
								isVoiceControlCategory ? VOICE_SHORTCUT_SECTION_ID : undefined
							}
							data-testid={
								isVoiceControlCategory
									? "keyboard-voice-shortcut-section"
									: undefined
							}
							data-focused-shortcut={
								isVoiceControlCategory && shouldFocusVoiceShortcut
									? "true"
									: undefined
							}
							className={cn(isVoiceControlCategory && "scroll-mt-6")}
						>
							<div className="mb-2 flex items-center justify-between gap-4">
								<h3 className="text-sm font-medium text-muted-foreground">
									{category}
								</h3>
								{isVoiceControlCategory &&
								voiceInputEnabled !== true &&
								!isVoiceInputLoading ? (
									<a
										className="text-xs text-primary underline-offset-4 hover:underline"
										data-testid="keyboard-voice-settings-link"
										href={VOICE_INPUT_SETTINGS_HREF}
										onClick={handleVoiceSettingsClick}
									>
										Enable Voice Control
									</a>
								) : null}
							</div>
							<div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
								{hotkeys.map((hotkey) => {
									const isVoiceShortcut = hotkey.id === VOICE_INPUT_HOTKEY_ID;
									return (
										<HotkeyRow
											key={hotkey.id}
											id={hotkey.id}
											label={hotkey.label}
											description={hotkey.description}
											disabled={
												isVoiceShortcut ? isVoiceShortcutDisabled : false
											}
											disabledReason={
												isVoiceShortcut
													? voiceShortcutDisabledReason
													: undefined
											}
											isFocused={focusedShortcutId === hotkey.id}
											isRecording={recordingId === hotkey.id}
											recordingHint={RECORDING_SHORTCUT_HINT}
											onStartRecording={() => handleStartRecording(hotkey.id)}
											onReset={() => {
												setRecordingId((current) =>
													current === hotkey.id ? null : current,
												);
												resetOverride(hotkey.id);
											}}
										/>
									);
								})}
							</div>
						</div>
					);
				})}

				{CATEGORY_ORDER.every(
					(cat) => (filteredHotkeysByCategory[cat] ?? []).length === 0,
				) && (
					<div className="py-8 text-center text-sm text-muted-foreground">
						No shortcuts found matching "{searchQuery}"
					</div>
				)}
			</div>

			{/* Conflict dialog */}
			<AlertDialog
				open={!!pendingConflict}
				onOpenChange={() => setPendingConflict(null)}
			>
				<AlertDialogContent className="max-w-[380px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Shortcut already in use
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									{conflictPrompt?.assignmentDescription ?? ""}
								</span>
								<span className="block">{conflictPrompt?.question ?? ""}</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							data-testid="keyboard-shortcuts-conflict-cancel"
							variant="ghost"
							size="sm"
							onClick={() => setPendingConflict(null)}
						>
							Cancel
						</Button>
						<Button
							data-testid="keyboard-shortcuts-conflict-reassign"
							variant="secondary"
							size="sm"
							onClick={handleConflictReassign}
						>
							Reassign
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
