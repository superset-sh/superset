import { alert } from "@superset/ui/atoms/Alert";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@superset/ui/sheet";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { Textarea } from "@superset/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	HiOutlineArrowDownTray,
	HiOutlineQuestionMarkCircle,
	HiOutlineTrash,
	HiPlus,
} from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { parseEnvContent, validateEnvContent } from "../../utils/env-file";

interface SecretEntry {
	id: string;
	key: string;
	value: string;
}

let entryIdCounter = 0;
function nextEntryId() {
	return `entry-${++entryIdCounter}`;
}

interface AddSecretSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
	organizationId: string;
	onSaved: () => void;
}

function createEmptyEntry(): SecretEntry {
	return { id: nextEntryId(), key: "", value: "" };
}

function toSecretEntries(
	entries: { key: string; value: string }[],
): SecretEntry[] {
	return entries.map((e) => ({
		id: nextEntryId(),
		key: e.key,
		value: e.value,
	}));
}

export function AddSecretSheet({
	open,
	onOpenChange,
	projectId,
	organizationId,
	onSaved,
}: AddSecretSheetProps) {
	const [entries, setEntries] = useState<SecretEntry[]>([createEmptyEntry()]);
	const [sensitive, setSensitive] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const hasContent = entries.some((e) => e.key.trim() || e.value.trim());

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen && hasContent) {
			alert.destructive({
				title: "Discard unsaved changes?",
				description:
					"You have unsaved environment variables. Are you sure you want to close?",
				confirmText: "Discard",
				onConfirm: () => onOpenChange(false),
			});
			return;
		}
		onOpenChange(nextOpen);
	};

	useEffect(() => {
		if (open) {
			setEntries([createEmptyEntry()]);
			setSensitive(true);
		}
	}, [open]);

	const updateEntry = (
		index: number,
		field: keyof SecretEntry,
		value: string | boolean,
	) => {
		setEntries((prev) => {
			const updated = [...prev];
			updated[index] = { ...updated[index], [field]: value };
			return updated;
		});
	};

	const removeEntry = (index: number) => {
		setEntries((prev) => {
			if (prev.length <= 1) return [createEmptyEntry()];
			return prev.filter((_, i) => i !== index);
		});
	};

	const addEntry = () => {
		setEntries((prev) => [...prev, createEmptyEntry()]);
	};

	const handleKeyPaste = (
		index: number,
		e: React.ClipboardEvent<HTMLInputElement>,
	) => {
		const pasted = e.clipboardData.getData("text");
		if (pasted.includes("=") && pasted.includes("\n")) {
			e.preventDefault();
			const parsed = toSecretEntries(parseEnvContent(pasted));
			if (parsed.length > 0) {
				setEntries((prev) => {
					const before = prev.slice(0, index);
					const after = prev.slice(index + 1);
					return [...before, ...parsed, ...after];
				});
			}
		}
	};

	const handleFileImport = useCallback((content: string) => {
		const parsed = toSecretEntries(parseEnvContent(content));
		if (parsed.length === 0) {
			toast.error("No valid environment variables found in file");
			return;
		}
		setEntries((prev) => {
			const hasExisting = prev.some((e) => e.key || e.value);
			return hasExisting ? [...prev, ...parsed] : parsed;
		});
	}, []);

	const MAX_FILE_SIZE = 256 * 1024; // 256 KB

	const validateAndReadFile = useCallback(
		(file: File) => {
			if (file.size > MAX_FILE_SIZE) {
				toast.error("File too large. Maximum size is 256 KB.");
				return;
			}

			const reader = new FileReader();
			reader.onload = (ev) => {
				const text = ev.target?.result;
				if (typeof text !== "string") return;

				const validation = validateEnvContent(text);
				if (!validation.ok) {
					toast.error(validation.error);
					return;
				}

				handleFileImport(text);
			};
			reader.onerror = () => {
				toast.error("Failed to read file.");
			};
			reader.readAsText(file);
		},
		[handleFileImport],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragOver(false);
			const file = e.dataTransfer.files[0];
			if (file) {
				validateAndReadFile(file);
			}
		},
		[validateAndReadFile],
	);

	const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			validateAndReadFile(file);
		}
		e.target.value = "";
	};

	const handleSave = async () => {
		const validEntries = entries.filter((e) => e.key.trim() && e.value.trim());
		if (validEntries.length === 0) return;

		setIsSaving(true);
		try {
			for (const entry of validEntries) {
				await apiTrpcClient.project.secrets.upsert.mutate({
					projectId,
					organizationId,
					key: entry.key.trim(),
					value: entry.value.trim(),
					sensitive,
				});
			}
			toast.success(
				validEntries.length === 1
					? `Added ${validEntries[0].key.trim()}`
					: `Added ${validEntries.length} environment variables`,
			);
			onSaved();
			onOpenChange(false);
		} catch (err) {
			console.error("[secrets/upsert] Failed to save:", err);
			toast.error("Failed to save environment variables");
		} finally {
			setIsSaving(false);
		}
	};

	const hasValidEntries = entries.some((e) => e.key.trim() && e.value.trim());

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent
				className="sm:max-w-xl w-full flex flex-col gap-0 p-0"
				onDragOver={(e) => {
					e.preventDefault();
					setIsDragOver(true);
				}}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={handleDrop}
			>
				<SheetHeader className="p-6 pb-4">
					<SheetTitle>Add Environment Variable</SheetTitle>
					<SheetDescription>
						Add one or more environment variables. You can also drag and drop a
						.env file.
					</SheetDescription>
				</SheetHeader>

				<div
					className={cn(
						"flex-1 overflow-y-auto border-2 border-dashed border-transparent transition-colors",
						isDragOver && "border-primary/50 bg-primary/5",
					)}
				>
					<div className="px-6 space-y-2">
						{/* Column headers */}
						<div className="flex items-center gap-2">
							<span className="flex-1 text-xs font-medium text-muted-foreground">
								Key
							</span>
							<span className="flex-1 text-xs font-medium text-muted-foreground">
								Value
							</span>
							{/* spacer for trash button */}
							<div className="w-8 shrink-0" />
						</div>

						{entries.map((entry, index) => (
							<div key={entry.id} className="flex items-start gap-2">
								<Input
									placeholder="CLIENT_KEY..."
									value={entry.key}
									onChange={(e) => updateEntry(index, "key", e.target.value)}
									onPaste={(e) => handleKeyPaste(index, e)}
									className="flex-1 font-mono text-sm mt-[1px]"
								/>
								<Textarea
									placeholder=""
									value={entry.value}
									onChange={(e) => updateEntry(index, "value", e.target.value)}
									className="flex-1 font-mono text-sm min-h-9 py-1.5"
									rows={1}
								/>
								{entries.length > 1 ? (
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground mt-[1px]"
										onClick={() => removeEntry(index)}
									>
										<HiOutlineTrash className="h-4 w-4" />
									</Button>
								) : (
									<div className="w-8 shrink-0" />
								)}
							</div>
						))}

						<Button
							variant="ghost"
							size="sm"
							className="text-muted-foreground gap-1.5"
							onClick={addEntry}
						>
							<HiPlus className="h-3.5 w-3.5" />
							Add Another
						</Button>

						<div className="flex items-center gap-2 pt-2">
							<Switch checked={sensitive} onCheckedChange={setSensitive} />
							<span className="text-sm text-muted-foreground">Sensitive</span>
							<Tooltip>
								<TooltipTrigger asChild>
									<HiOutlineQuestionMarkCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
								</TooltipTrigger>
								<TooltipContent side="right">
									<p className="max-w-[200px] text-xs">
										Sensitive values are encrypted and cannot be revealed in the
										UI after saving.
									</p>
								</TooltipContent>
							</Tooltip>
						</div>
					</div>
				</div>

				{/* Footer — pinned bottom, top border */}
				<div className="flex items-center justify-between border-t px-6 py-4">
					<div className="flex items-center gap-3">
						<Button
							variant="outline"
							size="sm"
							className="gap-1.5"
							onClick={() => fileInputRef.current?.click()}
						>
							<HiOutlineArrowDownTray className="h-3.5 w-3.5" />
							Import .env
						</Button>
						<span className="text-xs text-muted-foreground">
							or paste .env contents in Key input
						</span>
						<input
							ref={fileInputRef}
							type="file"
							accept="*"
							className="hidden"
							onChange={handleFileInputChange}
						/>
					</div>
					<Button onClick={handleSave} disabled={isSaving || !hasValidEntries}>
						{isSaving ? "Saving..." : "Save"}
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
}
