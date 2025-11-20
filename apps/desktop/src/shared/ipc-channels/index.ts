/**
 * Type-safe IPC channel definitions
 *
 * This file combines all IPC channel definitions from domain-specific modules.
 * Use these types in both main and renderer processes for type safety.
 */

import type { DeepLinkChannels } from "./deep-link";
import type { ExternalChannels } from "./external";
import type { ProxyChannels } from "./proxy";
import type { StorageChannels } from "./storage";
import type { TabChannels } from "./tab";
import type { TerminalChannels } from "./terminal";
import type { UiChannels } from "./ui";
import type { WindowChannels } from "./window";
import type { WorkspaceChannels } from "./workspace";
import type { WorktreeChannels } from "./worktree";

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
		WindowChannels,
		UiChannels,
		StorageChannels {}

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
