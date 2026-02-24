/**
 * Claude Code authentication resolution.
 *
 * Backward-compatible export surface for Anthropic auth helpers.
 */

export {
	getClaudeConfigPaths,
	getCredentialsFromConfig,
} from "./config-credentials";
export { getCredentialsFromKeychain } from "./keychain-credentials";
export {
	clearAnthropicOAuthRefreshState,
	getOrRefreshAnthropicOAuthCredentials,
} from "./oauth-refresh";
export type {
	ClaudeApiKeyCredentials,
	ClaudeCredentials,
	ClaudeOAuthCredentials,
} from "./types";
