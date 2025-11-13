/**
 * Shared types for IPC channel definitions
 */

/**
 * Standard response format for operations
 */
export interface IpcResponse<T = void> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * Helper type for channels with no request data
 */
export type NoRequest = void;

/**
 * Helper type for channels with no response data
 */
export type NoResponse = void;

/**
 * Helper type for simple success/error responses
 */
export type SuccessResponse = { success: boolean; error?: string };

