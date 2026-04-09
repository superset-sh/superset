export type WorkspaceHostTarget =
	| { kind: "local" }
	| { kind: "host"; hostId: string };
