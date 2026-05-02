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
import { toast } from "@superset/ui/sonner";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HiMagnifyingGlass } from "react-icons/hi2";
import {
	HOTKEYS,
	type HotkeyCategory,
	type HotkeyId,
	type ShortcutBinding,
	useFormatBinding,
	useHotkeyDisplay,
	useHotkeyOverridesStore,
	useRecordHotkeys,
} from "renderer/hotkeys";

const CATEGORY_ORDER: HotkeyCategory[] = [
	"Navigation",
	"Workspace",
	"Terminal",
	"Layout",
	"Window",
	"Help",
];

function HotkeyRow({
	id,
	label,
	description,
	isRecording,
	onStartRecording,
	onReset,
}: {
	id: HotkeyId;
	label: string;
	description?: string;
	isRecording: boolean;
	onStartRecording: () => void;
	onReset: () => void;
}) {
	const { keys } = useHotkeyDisplay(id);

	return (
		<div className="flex items-center justify-between gap-4 py-3 px-4">
			<div className="flex flex-col">
				<span className="text-sm text-foreground">{label}</span>
				{description && (
					<span className="text-xs text-muted-foreground">{description}</span>
				)}
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onStartRecording}
					className="h-7 px-3 rounded-md border border-border bg-accent/20 text-xs text-foreground hover:bg-accent/40 transition-colors"
				>
					{isRecording ? (
						<span className="text-xs text-muted-foreground">Recording…</span>
					) : (
						<KbdGroup>
							{keys.map((key) => (
								<Kbd key={key}>{key}</Kbd>
							))}
						</KbdGroup>
					)}
				</button>
				<Button variant="ghost" size="sm" onClick={onReset}>
					Reset
				</Button>
			</div>
		</div>
	);
}

export const Route = createFileRoute("/_authenticated/settings/keyboard/")({
	component: KeyboardShortcutsPage,
});

function getHotkeysByCategory(): Record<
	HotkeyCategory,
	Array<{ id: HotkeyId; label: string; description?: string }>
> {
	const grouped: Record<
		HotkeyCategory,
		Array<{ id: HotkeyId; label: string; description?: string }>
	> = {
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

function KeyboardShortcutsPage() {
	const [searchQuery, setSearchQuery] = useState("");
	const [recordingId, setRecordingId] = useState<HotkeyId | null>(null);
	const [pendingConflict, setPendingConflict] = useState<{
		targetId: HotkeyId;
		binding: ShortcutBinding;
		conflictId: HotkeyId;
	} | null>(null);

	const resetOverride = useHotkeyOverridesStore((s) => s.resetOverride);
	const resetAll = useHotkeyOverridesStore((s) => s.resetAll);
	const setOverride = useHotkeyOverridesStore((s) => s.setOverride);

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
	});

	const { keys: showHotkeysKeys } = useHotkeyDisplay("SHOW_HOTKEYS");

	const filteredHotkeysByCategory = useMemo(() => {
		if (!searchQuery) return hotkeysByCategory;
		const lower = searchQuery.toLowerCase();
		return Object.fromEntries(
			CATEGORY_ORDER.map((category) => [
				category,
				(hotkeysByCategory[category] ?? []).filter((hotkey) =>
					hotkey.label.toLowerCase().includes(lower),
				),
			]),
		) as typeof hotkeysByCategory;
	}, [searchQuery]);

	const handleStartRecording = (id: HotkeyId) => {
		setRecordingId((current) => (current === id ? null : id));
	};

	const handleConflictReassign = () => {
		if (!pendingConflict) return;
		setOverride(pendingConflict.conflictId, null);
		setOverride(pendingConflict.targetId, pendingConflict.binding);
		setPendingConflict(null);
	};

	const conflictDisplay = useFormatBinding(pendingConflict?.binding ?? null);

	return (
		<div className="p-6 w-full max-w-4xl">
			{/* Header */}
			<div className="mb-6 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
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
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							setRecordingId(null);
							resetAll();
						}}
					>
						Reset all
					</Button>
				</div>
			</div>

			{/* Search */}
			<div className="relative mb-6">
				<HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					type="text"
					placeholder="Search"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					className="pl-9 bg-accent/30 border-transparent focus:border-accent"
				/>
			</div>

			{/* Tables by Category */}
			<div className="max-h-[calc(100vh-320px)] overflow-y-auto space-y-6">
				{CATEGORY_ORDER.map((category) => {
					const hotkeys = filteredHotkeysByCategory[category] ?? [];
					if (hotkeys.length === 0) return null;

					return (
						<div key={category}>
							<h3 className="text-sm font-medium text-muted-foreground mb-2">
								{category}
							</h3>
							<div className="rounded-lg border border-border overflow-hidden">
								<div className="flex items-center justify-between py-2 px-4 bg-accent/10 border-b border-border">
									<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
										Command
									</span>
									<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
										Shortcut
									</span>
								</div>
								<div className="divide-y divide-border">
									{hotkeys.map((hotkey) => (
										<HotkeyRow
											key={hotkey.id}
											id={hotkey.id}
											label={hotkey.label}
											description={hotkey.description}
											isRecording={recordingId === hotkey.id}
											onStartRecording={() => handleStartRecording(hotkey.id)}
											onReset={() => {
												setRecordingId((current) =>
													current === hotkey.id ? null : current,
												);
												resetOverride(hotkey.id);
											}}
										/>
									))}
								</div>
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
									{pendingConflict
										? `${conflictDisplay.text} is already assigned to "${
												HOTKEYS[pendingConflict.conflictId].label
											}".`
										: ""}
								</span>
								<span className="block">Would you like to reassign it?</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setPendingConflict(null)}
						>
							Cancel
						</Button>
						<Button
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
