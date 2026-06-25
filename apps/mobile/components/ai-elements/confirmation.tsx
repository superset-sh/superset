import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";
import { View } from "react-native";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Text, TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type ConfirmationState =
	| "input-streaming"
	| "input-available"
	| "approval-requested"
	| "approval-responded"
	| "output-available"
	| "output-error"
	| "output-denied";

export type ConfirmationApproval =
	| {
			id: string;
			approved?: boolean;
			reason?: string;
	  }
	| undefined;

interface ConfirmationContextValue {
	approval: ConfirmationApproval;
	state: ConfirmationState;
}

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

export type ConfirmationProps = React.ComponentProps<typeof View> & {
	approval?: ConfirmationApproval;
	state: ConfirmationState;
};

export const Confirmation = ({
	className,
	approval,
	state,
	...props
}: ConfirmationProps) => {
	const contextValue = useMemo(() => ({ approval, state }), [approval, state]);

	if (!approval || state === "input-streaming" || state === "input-available") {
		return null;
	}

	return (
		<ConfirmationContext.Provider value={contextValue}>
			<TextClassContext.Provider value="text-foreground text-sm">
				<View
					role="alert"
					className={cn(
						"w-full flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3",
						className,
					)}
					{...props}
				/>
			</TextClassContext.Provider>
		</ConfirmationContext.Provider>
	);
};

export type ConfirmationTitleProps = React.ComponentProps<typeof Text>;

export const ConfirmationTitle = ({
	className,
	...props
}: ConfirmationTitleProps) => (
	<Text className={cn("text-muted-foreground text-sm", className)} {...props} />
);

export interface ConfirmationRequestProps {
	children?: ReactNode;
}

export const ConfirmationRequest = ({ children }: ConfirmationRequestProps) => {
	const { state } = useConfirmation();

	// Only show when approval is requested
	if (state !== "approval-requested") {
		return null;
	}

	return children;
};

export interface ConfirmationAcceptedProps {
	children?: ReactNode;
}

export const ConfirmationAccepted = ({
	children,
}: ConfirmationAcceptedProps) => {
	const { approval, state } = useConfirmation();

	// Only show when approved and in response states
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

export interface ConfirmationRejectedProps {
	children?: ReactNode;
}

export const ConfirmationRejected = ({
	children,
}: ConfirmationRejectedProps) => {
	const { approval, state } = useConfirmation();

	// Only show when rejected and in response states
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

export type ConfirmationActionsProps = React.ComponentProps<typeof View>;

export const ConfirmationActions = ({
	className,
	...props
}: ConfirmationActionsProps) => {
	const { state } = useConfirmation();

	// Only show when approval is requested
	if (state !== "approval-requested") {
		return null;
	}

	return (
		<View
			className={cn(
				"flex-row items-center justify-end gap-2 self-end",
				className,
			)}
			{...props}
		/>
	);
};

export type ConfirmationActionProps = ButtonProps;

export const ConfirmationAction = ({
	className,
	...props
}: ConfirmationActionProps) => (
	<Button className={cn("h-8 px-3", className)} size="sm" {...props} />
);
