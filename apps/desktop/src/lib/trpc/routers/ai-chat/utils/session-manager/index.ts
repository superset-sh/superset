import { initSessionStore } from "@superset/agent";
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";
import { SessionStore } from "../session-store";
import { ChatSessionManager } from "./session-manager";

export type {
	ClaudeStreamEvent,
	ErrorEvent,
	SessionEndEvent,
	SessionStartEvent,
} from "./session-events";
export { ChatSessionManager } from "./session-manager";

initSessionStore(SUPERSET_HOME_DIR);

const sessionStore = new SessionStore();

export const chatSessionManager = new ChatSessionManager(sessionStore);
export { sessionStore };
