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
	type AgentConfig,
	type Automation,
	type AutomationCreateParams,
	type AutomationListResponse,
	type AutomationLogsParams,
	type AutomationLogsResponse,
	type AutomationRun,
	type AutomationRunDispatched,
	Automations,
	type AutomationUpdateParams,
	type Host,
	type HostListResponse,
	Hosts,
	type HostWorkspace,
	type Project,
	type ProjectListResponse,
	Projects,
	type Task,
	type TaskCreateParams,
	type TaskListItem,
	type TaskListParams,
	type TaskListResponse,
	Tasks,
	type TaskUpdateParams,
	type CreatedWorkspace,
	type Workspace,
	type WorkspaceAgentSpawn,
	type WorkspaceCreateParams,
	type WorkspaceDeleteResult,
	type WorkspaceListParams,
	type WorkspaceListResponse,
	Workspaces,
} from "./resources/index";
