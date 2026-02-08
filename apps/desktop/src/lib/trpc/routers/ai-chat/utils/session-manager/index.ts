import { ClaudeSdkProvider } from "../agent-provider";
import { SessionStore } from "../session-store";
import { ChatSessionManager } from "./session-manager";

export type {
	ClaudeStreamEvent,
	ErrorEvent,
	SessionEndEvent,
	SessionStartEvent,
} from "./session-manager";
export { ChatSessionManager } from "./session-manager";

const provider = new ClaudeSdkProvider();
const sessionStore = new SessionStore();

export const chatSessionManager = new ChatSessionManager(
	provider,
	sessionStore,
);
export { sessionStore };
