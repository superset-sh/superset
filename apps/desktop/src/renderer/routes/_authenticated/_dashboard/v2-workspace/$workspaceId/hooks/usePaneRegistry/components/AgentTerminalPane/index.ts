/**
 * The ACP chat surface, behind the `acp-chat` flag. Everything it needs lives
 * under this folder — the pane, its chat, the toggle, the surface derivation
 * and the harness table — so removing the prototype is removing the folder
 * and these three imports.
 */
export { AgentTerminalPane } from "./AgentTerminalPane";
export { AgentSurfaceToggle } from "./components/AgentSurfaceToggle";
export { useAgentSurfaceSwitch } from "./hooks/useAgentSurfaceSwitch";
