"use client";

import { Button, type buttonVariants } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import type { VariantProps } from "class-variance-authority";
import { useState } from "react";

type AlertActionVariant = NonNullable<
	VariantProps<typeof buttonVariants>["variant"]
>;

interface AlertActionContext {
	/** Checked state of the optional "don't ask again"-style checkbox. */
	checkboxChecked: boolean;
}

interface AlertAction {
	label: string;
	variant?: AlertActionVariant;
	onClick?: (ctx: AlertActionContext) => void | Promise<void>;
}

interface AlertCheckbox {
	label: string;
	defaultChecked?: boolean;
}

type AlertOptions = {
	title: string;
	description: string;
	actions: AlertAction[];
	/** Optional checkbox rendered above the actions (e.g. "Don't ask again"). */
	checkbox?: AlertCheckbox;
	/**
	 * Called when the dialog is dismissed without triggering an action (Escape /
	 * outside-click). Lets callers resolve their promise as "cancelled" instead
	 * of hanging forever.
	 */
	onDismiss?: () => void;
};

let showAlertFn: ((options: AlertOptions) => void) | null = null;

const Alerter = () => {
	const [alertOptions, setAlertOptions] = useState<AlertOptions | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [loadingIndex, setLoadingIndex] = useState<number | null>(null);
	const [checkboxChecked, setCheckboxChecked] = useState(false);
	// Tracks whether the current open cycle was resolved by an action, so the
	// close handler knows whether to treat the close as a dismissal.
	const [actionTaken, setActionTaken] = useState(false);

	showAlertFn = (options) => {
		setAlertOptions(options);
		setLoadingIndex(null);
		setCheckboxChecked(options.checkbox?.defaultChecked ?? false);
		setActionTaken(false);
		setIsOpen(true);
	};

	const handleAction = async (action: AlertAction, index: number) => {
		setLoadingIndex(index);
		try {
			setActionTaken(true);
			await action.onClick?.({ checkboxChecked });
			setIsOpen(false);
		} catch (error) {
			setActionTaken(false);
			console.error("[alert] Action failed:", error);
		} finally {
			setLoadingIndex(null);
		}
	};

	const handleClose = () => {
		setIsOpen(false);
		if (!actionTaken) alertOptions?.onDismiss?.();
	};

	if (!alertOptions) return null;

	const actions = [...alertOptions.actions].reverse();

	return (
		<Dialog
			modal={true}
			open={isOpen}
			onOpenChange={(open) => !open && handleClose()}
		>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>{alertOptions.title}</DialogTitle>
					<DialogDescription>{alertOptions.description}</DialogDescription>
				</DialogHeader>
				{alertOptions.checkbox && (
					<Label className="flex items-center gap-2 text-sm font-normal">
						<Checkbox
							checked={checkboxChecked}
							onCheckedChange={(checked) =>
								setCheckboxChecked(checked === true)
							}
						/>
						{alertOptions.checkbox.label}
					</Label>
				)}
				<DialogFooter>
					{actions.map((action, i) => (
						<Button
							key={action.label}
							variant={action.variant ?? "default"}
							onClick={() => handleAction(action, i)}
							disabled={loadingIndex !== null}
						>
							{loadingIndex === i ? "Loading..." : action.label}
						</Button>
					))}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

const alert = (options: AlertOptions) => {
	if (!showAlertFn) {
		console.error(
			"[alert] Alerter not mounted. Make sure to render <Alerter /> in your app",
		);
		return;
	}
	showAlertFn(options);
};

export { Alerter, alert };
export type {
	AlertAction,
	AlertActionContext,
	AlertActionVariant,
	AlertOptions,
};
