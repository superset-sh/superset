"use client";

import {
	type ComponentProps,
	createContext,
	type ReactNode,
	useContext,
} from "react";
import { cn } from "../../lib/utils";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import type { ToolDisplayState } from "./tool";

export type ToolApproval =
	| {
			id: string;
			approved?: never;
			reason?: never;
	  }
	| {
			id: string;
			approved: boolean;
			reason?: string;
	  }
	| undefined;

type ConfirmationContextValue = {
	approval: ToolApproval;
	state: ToolDisplayState;
};

const ConfirmationContext = createContext<ConfirmationContextValue | null>(
	null,
);

const useConfirmation = () => {
	const context = useContext(ConfirmationContext);

	if (!context) {
		throw new Error("Confirmation components must be used within Confirmation");
	}

	return context;
};

export type ConfirmationProps = ComponentProps<typeof Alert> & {
	approval?: ToolApproval;
	state: ToolDisplayState;
};

export const Confirmation = ({
	className,
	approval,
	state,
	...props
}: ConfirmationProps) => {
	if (!approval || state === "input-streaming" || state === "input-available") {
		return null;
	}

	return (
		<ConfirmationContext.Provider value={{ approval, state }}>
			<Alert className={cn("flex flex-col gap-2", className)} {...props} />
		</ConfirmationContext.Provider>
	);
};

export type ConfirmationTitleProps = ComponentProps<typeof AlertDescription>;

export const ConfirmationTitle = ({
	className,
	...props
}: ConfirmationTitleProps) => (
	<AlertDescription className={cn("inline", className)} {...props} />
);

export type ConfirmationRequestProps = {
	children?: ReactNode;
};

export const ConfirmationRequest = ({ children }: ConfirmationRequestProps) => {
	const { state } = useConfirmation();

	if (state !== "approval-requested") {
		return null;
	}

	return children;
};

export type ConfirmationAcceptedProps = {
	children?: ReactNode;
};

export const ConfirmationAccepted = ({
	children,
}: ConfirmationAcceptedProps) => {
	const { approval, state } = useConfirmation();

	if (
		!approval?.approved ||
		(state !== "approval-responded" &&
			state !== "output-denied" &&
			state !== "output-available")
	) {
		return null;
	}

	return children;
};

export type ConfirmationRejectedProps = {
	children?: ReactNode;
};

export const ConfirmationRejected = ({
	children,
}: ConfirmationRejectedProps) => {
	const { approval, state } = useConfirmation();

	if (
		approval?.approved !== false ||
		(state !== "approval-responded" &&
			state !== "output-denied" &&
			state !== "output-available")
	) {
		return null;
	}

	return children;
};

export type ConfirmationActionsProps = ComponentProps<"div">;

export const ConfirmationActions = ({
	className,
	...props
}: ConfirmationActionsProps) => {
	const { state } = useConfirmation();

	if (state !== "approval-requested") {
		return null;
	}

	return (
		<div
			className={cn("flex items-center justify-end gap-2 self-end", className)}
			{...props}
		/>
	);
};

export type ConfirmationActionProps = ComponentProps<typeof Button>;

export const ConfirmationAction = (props: ConfirmationActionProps) => (
	<Button className="h-8 px-3 text-sm" type="button" {...props} />
);
