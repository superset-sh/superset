// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

export { type ClientOptions, Superset as default, Superset } from "./client";
export { APIPromise } from "./core/api-promise";
export {
	APIConnectionError,
	APIConnectionTimeoutError,
	APIError,
	APIUserAbortError,
	AuthenticationError,
	BadRequestError,
	ConflictError,
	InternalServerError,
	NotFoundError,
	PermissionDeniedError,
	RateLimitError,
	SupersetError,
	UnprocessableEntityError,
} from "./core/error";
export { toFile, type Uploadable } from "./core/uploads";

// Resource classes + their data shapes — bare top-level exports so consumers
// can `import { type Task } from '@superset_sh/sdk'` without going through
// the `Superset` namespace.
export {
	type AgentCreateParams,
	type AgentCreateResult,
	Agents,
	type CloudWorkspace,
	type CloudWorkspaceStatus,
	type Task,
	type TaskCreateParams,
	type TaskListItem,
	type TaskListParams,
	type TaskListResponse,
	Tasks,
	type TaskUpdateParams,
	type TerminalCloseParams,
	type TerminalAgentLifecycleEventType,
	type TerminalAgentStatus,
	type TerminalCloseResult,
	type TerminalCreateParams,
	type TerminalCreateResult,
	type TerminalListParams,
	type TerminalListResult,
	type TerminalReadParams,
	type TerminalReadResult,
	type TerminalSendParams,
	type TerminalSendResult,
	Terminals,
	type TerminalSummary,
	type WorkspaceCreateParams,
	type WorkspaceDeleteResult,
	type WorkspaceListParams,
	type WorkspaceListResponse,
	Workspaces,
	type WorkspaceUpdateParams,
} from "./resources/index";
