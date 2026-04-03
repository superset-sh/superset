"use client";

import { Button, type buttonVariants } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import type { VariantProps } from "class-variance-authority";
import { useState } from "react";

type AlertActionVariant = NonNullable<
	VariantProps<typeof buttonVariants>["variant"]
>;

interface AlertAction {
	label: string;
	variant?: AlertActionVariant;
	onClick: () => void | Promise<void>;
}

type AlertOptions = {
	title: string;
	description: string;
	actions: AlertAction[];
};

let showAlertFn: ((options: AlertOptions) => void) | null = null;

const Alerter = () => {
	const [alertOptions, setAlertOptions] = useState<AlertOptions | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [loadingIndex, setLoadingIndex] = useState<number | null>(null);

	showAlertFn = (options) => {
		setAlertOptions(options);
		setLoadingIndex(null);
		setIsOpen(true);
	};

	const handleAction = async (action: AlertAction, index: number) => {
		setLoadingIndex(index);
		try {
			await action.onClick();
			setIsOpen(false);
		} catch (error) {
			console.error("[alert] Action failed:", error);
		} finally {
			setLoadingIndex(null);
		}
	};

	const handleClose = () => {
		setIsOpen(false);
	};

	if (!alertOptions) return null;

	const actions = [...alertOptions.actions].reverse();

	return (
		<Dialog
			modal={true}
			open={isOpen}
			onOpenChange={(open) => !open && handleClose()}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{alertOptions.title}</DialogTitle>
					<DialogDescription>{alertOptions.description}</DialogDescription>
				</DialogHeader>
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
export type { AlertAction, AlertActionVariant, AlertOptions };
