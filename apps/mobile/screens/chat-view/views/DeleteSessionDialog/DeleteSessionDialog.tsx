import { useState } from "react";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { ChatView } from "../../components/ChatView";
import {
	MOCK_COMPOSER_SETTINGS,
	MOCK_HEADER,
	MOCK_THREAD_STREAMING,
} from "../../mock-data";

export type DeleteSessionDialogProps = {
	className?: string;
	sessionTitle?: string;
	autoOpen?: boolean;
	onConfirm?: () => void;
};

/**
 * UC-SESS-05 §A — destructive Delete session confirmation dialog over a
 * dimmed chat view. Composes the ConfirmationDialog organism with the
 * destructive variant; the chat behind it stays visible (dialog backdrop
 * dims, not occludes).
 */
export function DeleteSessionDialog({
	className,
	sessionTitle = MOCK_HEADER.title,
	autoOpen = true,
	onConfirm,
}: DeleteSessionDialogProps) {
	const [open, setOpen] = useState(autoOpen);

	return (
		<>
			<ChatView
				className={className}
				header={{ ...MOCK_HEADER }}
				items={MOCK_THREAD_STREAMING}
				composer={{
					state: "idle",
					rowProps: {
						settings: MOCK_COMPOSER_SETTINGS,
						onCommandsPress: () => {},
					},
				}}
			/>
			<ConfirmationDialog
				open={open}
				onOpenChange={setOpen}
				title="Delete session?"
				description={`"${sessionTitle}" will be permanently deleted. This cannot be undone.`}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				destructive
				onConfirm={() => {
					onConfirm?.();
					setOpen(false);
				}}
				onCancel={() => setOpen(false)}
			/>
		</>
	);
}
