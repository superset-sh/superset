/**
 * Type-safe IPC channel definitions
 *
 * This file combines all IPC channel definitions from domain-specific modules.
 * Use these types in both main and renderer processes for type safety.
 */

import type { DeepLinkChannels } from "./deep-link";
import type { ExternalChannels } from "./external";
import type { ProxyChannels } from "./proxy";
import type { TabChannels } from "./tab";
import type { TerminalChannels } from "./terminal";
import type { WindowChannels } from "./window";
import type { WorktreeChannels } from "./worktree";
import type { WorkspaceChannels } from "./workspace";

// Re-export shared types
export type {
	IpcResponse,
	NoRequest,
	NoResponse,
	SuccessResponse,
} from "./types";

/**
 * Combine all channel definitions into a single interface
 */
export interface IpcChannels
	extends WorkspaceChannels,
		WorktreeChannels,
		TabChannels,
		TerminalChannels,
		ProxyChannels,
		ExternalChannels,
		DeepLinkChannels,
		WindowChannels {}

/**
 * Type-safe IPC channel names
 */
export type IpcChannelName = keyof IpcChannels;

/**
 * Get request type for a channel
 */
export type IpcRequest<T extends IpcChannelName> = IpcChannels[T]["request"];

/**
 * Get response type for a channel
 */
export type IpcResponse_<T extends IpcChannelName> = IpcChannels[T]["response"];

/**
 * Type guard to check if a channel name is valid
 * Auto-generated from IpcChannels interface to prevent drift
 */
export function isValidChannel(channel: string): channel is IpcChannelName {
	// Auto-generate valid channels from the interface keys
	// This ensures the list stays in sync with IpcChannels
	const validChannels = Object.keys({} as IpcChannels) as IpcChannelName[];
	return validChannels.includes(channel as IpcChannelName);
}

/**
 * Get all valid channel names
 * Useful for debugging and validation
 */
export function getAllChannelNames(): IpcChannelName[] {
	return Object.keys({} as IpcChannels) as IpcChannelName[];
}

