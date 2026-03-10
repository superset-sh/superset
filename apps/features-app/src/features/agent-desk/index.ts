/**
 * Agent Desk Feature - Client
 */

// Routes
export {
  AGENT_DESK_PATH,
  AGENT_DESK_OPERATOR_PATH,
  AGENT_DESK_TERMINAL_PATH,
  createAgentDeskRoutes,
  createAgentDeskStandaloneRoutes,
  createAgentDeskCustomerRoute,
  createAgentDeskOperatorRoute,
  createAgentDeskChatRoute,
  createAgentDeskTerminalRoute,
} from "./routes";

// Pages
export { SessionList, Chat } from "./pages";

// Hooks
export {
  useSessions,
  useSession,
  useCreateSession,
  useDeleteSession,
  useUpdateSessionStatus,
  useSendMessage,
  useMessages,
  useConfirmUpload,
  useRemoveFile,
  useParseFile,
  useFiles,
} from "./hooks";

// Types
export type * from "./types";
