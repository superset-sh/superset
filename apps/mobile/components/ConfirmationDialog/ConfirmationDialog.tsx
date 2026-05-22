import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Text } from "@/components/ui/text";

export type ConfirmationDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	/** When true, confirm button uses destructive variant. */
	destructive?: boolean;
	onConfirm: () => void;
	onCancel?: () => void;
};

/**
 * Confirmation dialog for destructive or irreversible actions. UC-SESS-05.
 *
 * Composes the vendor AlertDialog primitive (rn-primitives) — backdrop +
 * centered card + Cancel/Action footer rendered via portal. Trigger is
 * external; this organism accepts `open` / `onOpenChange` for controlled use.
 */
export function ConfirmationDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	destructive = false,
	onConfirm,
	onCancel,
}: ConfirmationDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					{description ? (
						<AlertDialogDescription>{description}</AlertDialogDescription>
					) : null}
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onPress={onCancel}>
						<Text>{cancelLabel}</Text>
					</AlertDialogCancel>
					<AlertDialogAction
						onPress={onConfirm}
						className={destructive ? "bg-destructive" : undefined}
					>
						<Text
							className={
								destructive ? "text-destructive-foreground" : undefined
							}
						>
							{confirmLabel}
						</Text>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
