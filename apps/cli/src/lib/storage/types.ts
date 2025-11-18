import type {
	Agent,
	AgentSummary,
	Change,
	Environment,
	FileDiff,
	Process,
	Workspace,
} from "../../types/index";

/**
 * Database schema for JSON storage
 * All entities stored as key-value records indexed by ID
 */
export interface Database {
	environments: Record<string, Environment>;
	workspaces: Record<string, Workspace>;
	processes: Record<string, Process>;
	changes: Record<string, Change>;
	fileDiffs: Record<string, FileDiff>;
	agentSummaries: Record<string, AgentSummary>;
}

/**
 * Serialized version of database for JSON storage
 * Dates are converted to ISO strings for persistence
 */
export interface SerializedDatabase {
	environments: Record<string, SerializedEnvironment>;
	workspaces: Record<string, SerializedWorkspace>;
	processes: Record<string, SerializedProcess>;
	changes: Record<string, SerializedChange>;
	fileDiffs: Record<string, SerializedFileDiff>;
	agentSummaries: Record<string, SerializedAgentSummary>;
}

// Serialized type helpers - convert Date fields to string
type Serialized<T> = {
	[K in keyof T]: T[K] extends Date
		? string
		: T[K] extends Date | undefined
			? string | undefined
			: T[K];
};

export type SerializedEnvironment = Serialized<Environment>;
export type SerializedWorkspace = Serialized<Workspace>;
export type SerializedProcess = Serialized<Process>;
export type SerializedAgent = Serialized<Agent>;
export type SerializedChange = Serialized<Change>;
export type SerializedFileDiff = Serialized<FileDiff>;
export type SerializedAgentSummary = Serialized<AgentSummary>;

/**
 * Empty database structure for initialization
 */
export const createEmptyDatabase = (): SerializedDatabase => ({
	environments: {},
	workspaces: {},
	processes: {},
	changes: {},
	fileDiffs: {},
	agentSummaries: {},
});
