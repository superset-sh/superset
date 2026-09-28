import { Trans, useLingui } from "@lingui/react/macro";
import type { ChatPinRow } from "@superset/chat-runtime";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import {
	ArrowDownToLine,
	ChevronRight,
	Pencil,
	PinOff,
	Quote,
} from "lucide-react";
import { useState } from "react";

export function PinsPanel({
	onJump,
	onQuote,
	onRename,
	onUnpin,
	pins,
}: {
	pins: ChatPinRow[];
	onJump: (itemId: string) => void;
	onQuote: (text: string) => void;
	onRename: (itemId: string, label: string) => void;
	onUnpin: (itemId: string) => void;
}) {
	const { t } = useLingui();
	const [open, setOpen] = useState(true);
	const [editingItemId, setEditingItemId] = useState<string | null>(null);
	const [draftLabel, setDraftLabel] = useState("");

	if (pins.length === 0) return null;

	const commitRename = (itemId: string) => {
		const label = draftLabel.trim();
		if (label) void onRename(itemId, label);
		setEditingItemId(null);
	};

	return (
		<div className="border-b border-border">
			<button
				className="flex w-full items-center gap-1 px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground"
				onClick={() => setOpen((previous) => !previous)}
				type="button"
			>
				<ChevronRight
					className={
						open
							? "size-3 rotate-90 transition-transform"
							: "size-3 transition-transform"
					}
				/>
				<Trans>Pinned</Trans>
				<span className="font-mono">{pins.length}</span>
			</button>
			{open && (
				<ul className="max-h-48 space-y-1 overflow-y-auto px-4 pb-2">
					{pins.map((pin) => (
						<li
							className="group/pin rounded-md border border-border bg-muted/40 px-2.5 py-1.5"
							key={pin.itemId}
						>
							{editingItemId === pin.itemId ? (
								<Input
									autoFocus
									className="h-7 text-xs"
									defaultValue={pin.label}
									maxLength={120}
									onChange={(event) => setDraftLabel(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter") commitRename(pin.itemId);
										if (event.key === "Escape") setEditingItemId(null);
									}}
								/>
							) : (
								<button
									className="block w-full truncate text-left text-xs font-medium hover:underline"
									onClick={() => onJump(pin.itemId)}
									title={pin.label}
									type="button"
								>
									{pin.label}
								</button>
							)}
							<p className="mt-0.5 line-clamp-2 whitespace-pre-wrap wrap-break-word text-xs text-muted-foreground">
								{pin.snapshotText}
							</p>
							<div className="mt-1 flex items-center gap-1">
								<Button
									onClick={() => onJump(pin.itemId)}
									size="icon-sm"
									title={t({ message: "Jump to message" })}
									variant="ghost"
								>
									<ArrowDownToLine className="size-3.5" />
								</Button>
								<Button
									onClick={() => onQuote(pin.snapshotText)}
									size="icon-sm"
									title={t({ message: "Insert into prompt" })}
									variant="ghost"
								>
									<Quote className="size-3.5" />
								</Button>
								<Button
									onClick={() => {
										setDraftLabel(pin.label);
										setEditingItemId(pin.itemId);
									}}
									size="icon-sm"
									title={t({ message: "Rename" })}
									variant="ghost"
								>
									<Pencil className="size-3.5" />
								</Button>
								<Button
									onClick={() => onUnpin(pin.itemId)}
									size="icon-sm"
									title={t({ message: "Unpin message" })}
									variant="ghost"
								>
									<PinOff className="size-3.5" />
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
