export const RUN_CYCLE = ["run1", "run2", "run3", "run2"] as const;

export type FrameName =
	| "stand"
	| "idle"
	| "run1"
	| "run2"
	| "run3"
	| "bite"
	| "roar"
	| "hurt"
	| "ko"
	| "sprawl";
