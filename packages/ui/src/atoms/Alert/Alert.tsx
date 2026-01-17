"use client";

import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useState } from "react";

type AlertOptions = {
	title: string;
	description: string;
	confirmText?: string;
	cancelText?: string;
	onConfirm: () => void | Promise<void>;
	onCancel?: () => void;
};

type InternalAlertOptions = AlertOptions & {
	variant: "default" | "destructive";
};

let showAlertFn: ((options: InternalAlertOptions) => void) | null = null;

const Alerter = () => {
	const [alertOptions, setAlertOptions] = useState<InternalAlertOptions | null>(
		null,
	);
	const [isOpen, setIsOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	showAlertFn = (options) => {
		setAlertOptions(options);
		setIsOpen(true);
	};

	const handleConfirm = async () => {
		if (!alertOptions) return;

		setIsLoading(true);
		try {
			await alertOptions.onConfirm();
			setIsOpen(false);
		} catch (error) {
			console.error("[alert] Confirmation failed:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleCancel = () => {
		if (!alertOptions) return;
		alertOptions.onCancel?.();
		setIsOpen(false);
	};

	return (
		<Dialog
			modal={true}
			open={isOpen}
			onOpenChange={(open) => !open && handleCancel()}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{alertOptions?.title}</DialogTitle>
					<DialogDescription>{alertOptions?.description}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={handleCancel} disabled={isLoading}>
						{alertOptions?.cancelText ?? "Cancel"}
					</Button>
					<Button
						variant={alertOptions?.variant ?? "default"}
						onClick={handleConfirm}
						disabled={isLoading}
					>
						{isLoading
							? "Loading..."
							: (alertOptions?.confirmText ?? "Confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

const createAlert = (variant: "default" | "destructive") => {
	return (options: AlertOptions) => {
		if (!showAlertFn) {
			console.error(
				"[alert] Alerter not mounted. Make sure to render <Alerter /> in your app",
			);
			return;
		}
		const internalOptions: InternalAlertOptions = { ...options, variant };
		showAlertFn(internalOptions);
	};
};

const alert = Object.assign(createAlert("default"), {
	destructive: createAlert("destructive"),
});

export { Alerter, alert };
