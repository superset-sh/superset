import type { Tab } from "main/lib/trpc/routers/tabs";

export interface TerminalProps {
	tab: Tab & { type: "terminal" };
}

export type TerminalStreamEvent =
	| { type: "data"; data: string }
	| { type: "exit"; exitCode: number };
