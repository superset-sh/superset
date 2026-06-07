import type { ReactNode } from "react";
import type { ChartColorName, WidgetTokens } from "./tokens";

/** PR summary handed to widgets, assembled from the card-line renderer props. */
export interface WidgetPrContext {
	number?: number;
	title?: string;
	url?: string;
	/** Coarse CI checks summary if available. */
	checks?: "success" | "failure" | "pending" | "none";
	reviewDecision?: string | null;
}

/** Linear ticket summary handed to widgets, when one is linked. */
export interface WidgetLinearTicket {
	key: string;
	state: string;
	url: string;
}

/**
 * Read-only context describing the workspace the widget renders for. Assembled
 * from whatever data the card-line renderers already have — widgets receive a
 * snapshot, not live plumbing.
 */
export interface WidgetContext {
	workspaceId: string;
	projectId: string;
	workspaceName: string;
	branch: string;
	/** Absolute workspace folder path when known. */
	folder?: string;
	pr?: WidgetPrContext | null;
	linearTicket?: WidgetLinearTicket | null;
	/** Coarse agent status: working / permission / review, or null. */
	status?: "working" | "permission" | "review" | null;
}

/** Result of a widget command poll (first non-empty stdout line). */
export interface WidgetCommandState {
	output: string | null;
	error: string | null;
	isLoading: boolean;
}

/** Result of a one-shot widget command run (click action). */
export interface WidgetRunResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
	error: string | null;
}

export interface WidgetRowProps {
	children: ReactNode;
	className?: string;
	title?: string;
}

export interface WidgetTextProps {
	children: ReactNode;
	/** De-emphasize using muted-foreground. Default true (matches card lines). */
	muted?: boolean;
	/** Truncate with ellipsis. Default true. */
	truncate?: boolean;
	className?: string;
	title?: string;
}

export interface WidgetBadgeProps {
	children: ReactNode;
	/** Token name from the chart palette (chart1..chart5). Defaults to muted. */
	color?: ChartColorName;
	className?: string;
	title?: string;
}

export interface WidgetButtonProps {
	children: ReactNode;
	onClick?: () => void;
	disabled?: boolean;
	className?: string;
	title?: string;
}

export interface WidgetLinkProps {
	children: ReactNode;
	/** URL to open. Plain click opens in-app; cmd/meta+click opens the browser. */
	href: string;
	className?: string;
	title?: string;
}

/**
 * The kit handed to a widget. Styled primitives + command hooks + tokens, all
 * bound to the widget's ctx (workspaceId / lineId). Authors never import React
 * APIs for these — they use the kit so styling and security stay consistent.
 */
export interface WidgetKit {
	Row: (props: WidgetRowProps) => ReactNode;
	Text: (props: WidgetTextProps) => ReactNode;
	Badge: (props: WidgetBadgeProps) => ReactNode;
	Button: (props: WidgetButtonProps) => ReactNode;
	Link: (props: WidgetLinkProps) => ReactNode;
	/** Poll a shell command; returns its first output line + loading/error. */
	useCommand: (
		command: string,
		options?: { refetchInterval?: number },
	) => WidgetCommandState;
	/** Run a one-shot shell command (click action) + toast its result. */
	runCommand: (command: string) => Promise<WidgetRunResult>;
	tokens: WidgetTokens;
}

/** Props a widget's default export receives. */
export interface WidgetProps {
	ctx: WidgetContext;
	kit: WidgetKit;
}

/** The shape a widget module must default-export. */
export type WidgetComponent = (props: WidgetProps) => ReactNode;
