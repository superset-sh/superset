import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "../../../ui/alert-dialog";
import { Label } from "../../../ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../../ui/select";
import { toast } from "../../../ui/sonner";
import type { ShareConfirmation, ShareGeneralAccess } from "../../types";

interface GeneralAccessProps {
	general: ShareGeneralAccess;
	canManage: boolean;
}

export function GeneralAccess({ general, canManage }: GeneralAccessProps) {
	const { t } = useLingui();
	const [busy, setBusy] = useState(false);
	const [pending, setPending] = useState<{
		to: string;
		confirmation: ShareConfirmation;
	} | null>(null);

	const run = async (action: () => Promise<void>) => {
		setBusy(true);
		try {
			await action();
		} catch (error) {
			toast.error(
				errorMessage(error, t({ message: "Could not change who has access" })),
			);
		} finally {
			setBusy(false);
		}
	};

	const choose = (to: string) => {
		if (to === general.value) return;
		const confirmation = general.confirm?.(general.value, to) ?? null;
		if (confirmation) setPending({ to, confirmation });
		else void run(() => general.onChange(to));
	};

	const role = general.role;
	const showRole = role?.appliesTo.includes(general.value) ?? false;

	return (
		<div className="space-y-2">
			<div className="space-y-0.5">
				<Label className="font-medium text-sm">
					<Trans>General access</Trans>
				</Label>
				<p className="text-muted-foreground text-xs">
					{canManage ? (
						general.hint
					) : (
						<Trans>Only the owner can change this</Trans>
					)}
				</p>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<Select
					value={general.value}
					disabled={!canManage || busy}
					onValueChange={choose}
				>
					<SelectTrigger size="sm" className="w-auto max-w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{general.options.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.icon}
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{role && showRole ? (
					<Select
						value={role.value}
						disabled={!canManage || busy}
						onValueChange={(value) => void run(() => role.onChange(value))}
					>
						<SelectTrigger
							size="sm"
							className="text-muted-foreground hover:text-foreground shrink-0 border-none bg-transparent px-1.5 text-xs shadow-none dark:bg-transparent dark:hover:bg-accent"
							aria-label={t({ message: "What general access allows" })}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent align="end">
							{role.options.map((option) => (
								<SelectItem key={option.id} value={option.id}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : null}
			</div>
			<AlertDialog
				open={pending !== null}
				onOpenChange={(open) => {
					if (!open) setPending(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{pending?.confirmation.title}</AlertDialogTitle>
						<AlertDialogDescription>
							{pending?.confirmation.description}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								const to = pending?.to;
								setPending(null);
								if (to) void run(() => general.onChange(to));
							}}
						>
							{pending?.confirmation.actionLabel}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
