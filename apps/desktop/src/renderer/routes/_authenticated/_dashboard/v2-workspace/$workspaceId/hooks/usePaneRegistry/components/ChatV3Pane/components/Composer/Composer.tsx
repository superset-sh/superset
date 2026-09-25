import { useLingui } from "@lingui/react/macro";
import type { OutboxEntry } from "@superset/chat/core";
import type { UserContent } from "@superset/chat/protocol";
import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const DRAFT_DEBOUNCE_MS = 300;

export type ComposerProps = {
	draftKey: string;
	outbox: OutboxEntry[];
	onSend: (content: UserContent[]) => OutboxEntry | null;
	placeholder?: string;
	disabled?: boolean;
	onCancelTurn?: (() => void) | null;
};

export function Composer({
	disabled,
	draftKey,
	onCancelTurn,
	onSend,
	outbox,
	placeholder,
}: ComposerProps) {
	const { t } = useLingui();
	const [value, setValue] = useState(
		() => window.localStorage.getItem(draftKey) ?? "",
	);
	const valueRef = useRef(value);
	valueRef.current = value;
	const pendingRef = useRef<{ clientId: string; sentText: string } | null>(
		null,
	);

	useEffect(() => {
		const timer = setTimeout(() => {
			if (value === "") window.localStorage.removeItem(draftKey);
			else window.localStorage.setItem(draftKey, value);
		}, DRAFT_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [value, draftKey]);

	useEffect(() => {
		return () => {
			const latest = valueRef.current;
			if (latest === "") window.localStorage.removeItem(draftKey);
			else window.localStorage.setItem(draftKey, latest);
		};
	}, [draftKey]);

	useEffect(() => {
		const pending = pendingRef.current;
		if (!pending) return;
		if (outbox.some((entry) => entry.clientId === pending.clientId)) return;
		pendingRef.current = null;
		if (valueRef.current === pending.sentText) {
			setValue("");
			window.localStorage.removeItem(draftKey);
		}
	}, [outbox, draftKey]);

	const send = () => {
		const text = valueRef.current;
		if (text.trim() === "" || disabled) return;
		const entry = onSend([{ type: "text", text }]);
		if (entry === null) {
			setValue("");
			window.localStorage.removeItem(draftKey);
			return;
		}
		pendingRef.current = { clientId: entry.clientId, sentText: text };
	};

	return (
		<div className="flex items-end gap-2 border-t border-border p-3">
			<Textarea
				className="max-h-40 min-h-10 flex-1 resize-none"
				disabled={disabled}
				onChange={(event) => setValue(event.target.value)}
				onKeyDown={(event) => {
					if (
						event.key === "Enter" &&
						!event.shiftKey &&
						!event.nativeEvent.isComposing
					) {
						event.preventDefault();
						send();
					}
				}}
				placeholder={
					placeholder ??
					t({
						message: "Message the agent",
					})
				}
				value={value}
			/>
			{onCancelTurn ? (
				<Button onClick={onCancelTurn} size="icon" variant="outline">
					<Square className="size-4" />
				</Button>
			) : (
				<Button
					disabled={disabled || value.trim() === ""}
					onClick={send}
					size="icon"
				>
					<ArrowUp className="size-4" />
				</Button>
			)}
		</div>
	);
}
