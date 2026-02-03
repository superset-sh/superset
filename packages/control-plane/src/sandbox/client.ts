/**
 * Modal Sandbox API Client
 *
 * Provides methods to interact with Modal sandboxes from the control plane.
 * All requests are authenticated using HMAC-signed tokens.
 */

import { generateInternalToken } from "../auth/internal";

const MODAL_APP_NAME = "superset-cloud";

/**
 * Construct the Modal base URL from workspace name.
 */
function getModalBaseUrl(workspace: string): string {
	return `https://${workspace}--${MODAL_APP_NAME}`;
}

export interface CreateSandboxRequest {
	sessionId: string;
	sandboxId?: string;
	repoOwner: string;
	repoName: string;
	branch: string;
	baseBranch: string;
	controlPlaneUrl: string;
	sandboxAuthToken: string;
	snapshotId?: string;
	gitUserName?: string;
	gitUserEmail?: string;
	provider?: string;
	model?: string;
}

export interface CreateSandboxResponse {
	sandboxId: string;
	modalObjectId?: string;
	status: string;
	createdAt: number;
}

export interface SnapshotInfo {
	id: string;
	repoOwner: string;
	repoName: string;
	baseSha: string;
	status: string;
	createdAt: string;
	expiresAt?: string;
}

interface ModalApiResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * Modal sandbox API client.
 */
export class ModalClient {
	private createSandboxUrl: string;
	private warmSandboxUrl: string;
	private healthUrl: string;
	private snapshotUrl: string;
	private snapshotSandboxUrl: string;
	private restoreSandboxUrl: string;
	private terminateUrl: string;
	private secret: string;

	constructor(secret: string, workspace: string) {
		if (!secret) {
			throw new Error(
				"ModalClient requires MODAL_API_SECRET for authentication",
			);
		}
		if (!workspace) {
			throw new Error(
				"ModalClient requires MODAL_WORKSPACE for URL construction",
			);
		}
		this.secret = secret;
		const baseUrl = getModalBaseUrl(workspace);
		this.createSandboxUrl = `${baseUrl}-api-create-sandbox.modal.run`;
		this.warmSandboxUrl = `${baseUrl}-api-warm-sandbox.modal.run`;
		this.healthUrl = `${baseUrl}-api-health.modal.run`;
		this.snapshotUrl = `${baseUrl}-api-snapshot.modal.run`;
		this.snapshotSandboxUrl = `${baseUrl}-api-snapshot-sandbox.modal.run`;
		this.restoreSandboxUrl = `${baseUrl}-api-restore-sandbox.modal.run`;
		this.terminateUrl = `${baseUrl}-api-terminate-sandbox.modal.run`;
	}

	/**
	 * Generate authentication headers for POST requests.
	 */
	private async getPostHeaders(): Promise<Record<string, string>> {
		const token = await generateInternalToken(this.secret);
		return {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		};
	}

	/**
	 * Generate authentication headers for GET requests.
	 */
	private async getGetHeaders(): Promise<Record<string, string>> {
		const token = await generateInternalToken(this.secret);
		return {
			Authorization: `Bearer ${token}`,
		};
	}

	/**
	 * Create a new sandbox for a session.
	 */
	async createSandbox(
		request: CreateSandboxRequest,
	): Promise<CreateSandboxResponse> {
		console.log("[ModalClient] Creating sandbox:", request.sessionId);

		const headers = await this.getPostHeaders();
		const response = await fetch(this.createSandboxUrl, {
			method: "POST",
			headers,
			body: JSON.stringify({
				session_id: request.sessionId,
				sandbox_id: request.sandboxId || null,
				repo_owner: request.repoOwner,
				repo_name: request.repoName,
				branch: request.branch,
				base_branch: request.baseBranch,
				control_plane_url: request.controlPlaneUrl,
				sandbox_auth_token: request.sandboxAuthToken,
				snapshot_id: request.snapshotId || null,
				git_user_name: request.gitUserName || null,
				git_user_email: request.gitUserEmail || null,
				provider: request.provider || "anthropic",
				model: request.model || "claude-sonnet-4",
			}),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Modal API error: ${response.status} ${text}`);
		}

		const result = (await response.json()) as ModalApiResponse<{
			sandbox_id: string;
			modal_object_id?: string;
			status: string;
			created_at: number;
		}>;

		if (!result.success || !result.data) {
			throw new Error(`Modal API error: ${result.error || "Unknown error"}`);
		}

		return {
			sandboxId: result.data.sandbox_id,
			modalObjectId: result.data.modal_object_id,
			status: result.data.status,
			createdAt: result.data.created_at,
		};
	}

	/**
	 * Pre-warm a sandbox for faster startup.
	 */
	async warmSandbox(request: {
		repoOwner: string;
		repoName: string;
		controlPlaneUrl?: string;
	}): Promise<{ sandboxId: string; status: string }> {
		console.log(
			"[ModalClient] Warming sandbox:",
			request.repoOwner,
			request.repoName,
		);

		const headers = await this.getPostHeaders();
		const response = await fetch(this.warmSandboxUrl, {
			method: "POST",
			headers,
			body: JSON.stringify({
				repo_owner: request.repoOwner,
				repo_name: request.repoName,
				control_plane_url: request.controlPlaneUrl || "",
			}),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Modal API error: ${response.status} ${text}`);
		}

		const result = (await response.json()) as ModalApiResponse<{
			sandbox_id: string;
			status: string;
		}>;

		if (!result.success || !result.data) {
			throw new Error(`Modal API error: ${result.error || "Unknown error"}`);
		}

		return {
			sandboxId: result.data.sandbox_id,
			status: result.data.status,
		};
	}

	/**
	 * Terminate a sandbox.
	 */
	async terminateSandbox(sandboxId: string): Promise<void> {
		console.log("[ModalClient] Terminating sandbox:", sandboxId);

		const headers = await this.getPostHeaders();
		const response = await fetch(this.terminateUrl, {
			method: "POST",
			headers,
			body: JSON.stringify({ sandbox_id: sandboxId }),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Modal API error: ${response.status} ${text}`);
		}
	}

	/**
	 * Take a snapshot of a sandbox.
	 */
	async snapshotSandbox(sandboxId: string): Promise<string> {
		console.log("[ModalClient] Taking snapshot:", sandboxId);

		const headers = await this.getPostHeaders();
		const response = await fetch(this.snapshotSandboxUrl, {
			method: "POST",
			headers,
			body: JSON.stringify({ sandbox_id: sandboxId }),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Modal API error: ${response.status} ${text}`);
		}

		const result = (await response.json()) as ModalApiResponse<{
			snapshot_id: string;
		}>;

		if (!result.success || !result.data) {
			throw new Error(`Modal API error: ${result.error || "Unknown error"}`);
		}

		return result.data.snapshot_id;
	}

	/**
	 * Restore a sandbox from a snapshot.
	 */
	async restoreSandbox(request: {
		snapshotId: string;
		sessionId: string;
		controlPlaneUrl: string;
		sandboxAuthToken: string;
	}): Promise<CreateSandboxResponse> {
		console.log(
			"[ModalClient] Restoring sandbox from snapshot:",
			request.snapshotId,
		);

		const headers = await this.getPostHeaders();
		const response = await fetch(this.restoreSandboxUrl, {
			method: "POST",
			headers,
			body: JSON.stringify({
				snapshot_id: request.snapshotId,
				session_id: request.sessionId,
				control_plane_url: request.controlPlaneUrl,
				sandbox_auth_token: request.sandboxAuthToken,
			}),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Modal API error: ${response.status} ${text}`);
		}

		const result = (await response.json()) as ModalApiResponse<{
			sandbox_id: string;
			modal_object_id?: string;
			status: string;
			created_at: number;
		}>;

		if (!result.success || !result.data) {
			throw new Error(`Modal API error: ${result.error || "Unknown error"}`);
		}

		return {
			sandboxId: result.data.sandbox_id,
			modalObjectId: result.data.modal_object_id,
			status: result.data.status,
			createdAt: result.data.created_at,
		};
	}

	/**
	 * Check Modal API health.
	 */
	async health(): Promise<{ status: string; service: string }> {
		const response = await fetch(this.healthUrl);

		if (!response.ok) {
			throw new Error(`Modal API error: ${response.status}`);
		}

		const result = (await response.json()) as ModalApiResponse<{
			status: string;
			service: string;
		}>;

		if (!result.success || !result.data) {
			throw new Error(`Modal API error: ${result.error || "Unknown error"}`);
		}

		return result.data;
	}

	/**
	 * Get the latest snapshot for a repository.
	 */
	async getLatestSnapshot(
		repoOwner: string,
		repoName: string,
	): Promise<SnapshotInfo | null> {
		const url = `${this.snapshotUrl}?repo_owner=${encodeURIComponent(repoOwner)}&repo_name=${encodeURIComponent(repoName)}`;

		const headers = await this.getGetHeaders();
		const response = await fetch(url, { headers });

		if (!response.ok) {
			return null;
		}

		const result = (await response.json()) as ModalApiResponse<SnapshotInfo>;

		if (!result.success) {
			return null;
		}

		return result.data || null;
	}
}

/**
 * Create a new Modal client instance.
 */
export function createModalClient(
	secret: string,
	workspace: string,
): ModalClient {
	return new ModalClient(secret, workspace);
}
