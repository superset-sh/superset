import type { APIPromise } from "../core/api-promise";
import { SupersetError } from "../core/error";
import { APIResource } from "../core/resource";
import type { RequestOptions } from "../internal/request-options";

export class Hosts extends APIResource {
	/**
	 * List hosts (developer machines registered in the organization) the
	 * caller has access to.
	 *
	 * Mirrors `superset hosts list`.
	 */
	list(options?: RequestOptions): APIPromise<HostListResponse> {
		return this._client.query<HostListResponse>(
			{ method: "hosts.list", procedure: "host.list" },
			{ organizationId: this._requireOrgId() },
			options,
		);
	}

	/**
	 * Set, or clear with `null`, the shell command that wakes a host. Owner
	 * only: any member can run it locally with `superset hosts wake`.
	 *
	 * Mirrors `superset hosts set-wake <host> <command…>` / `--clear`.
	 */
	setWakeCommand(
		params: HostSetWakeCommandParams,
		options?: RequestOptions,
	): APIPromise<HostSetWakeCommandResult> {
		return this._client.mutation<HostSetWakeCommandResult>(
			{ method: "hosts.setWakeCommand", procedure: "host.setWakeCommand" },
			{
				organizationId: this._requireOrgId(),
				machineId: params.hostId,
				wakeCommand: params.wakeCommand,
			},
			options,
		);
	}

	private _requireOrgId(): string {
		if (!this._client.organizationId) {
			throw new SupersetError(
				"organizationId is required. Set SUPERSET_ORGANIZATION_ID, or pass `organizationId` to the Superset constructor.",
			);
		}
		return this._client.organizationId;
	}
}

export interface Host {
	/** Stable host machine identifier. */
	id: string;
	name: string;
	online: boolean;
	/** Shell command members run locally to wake the host; null when unset. */
	wakeCommand: string | null;
	organizationId: string;
}

export type HostListResponse = Array<Host>;

export interface HostSetWakeCommandParams {
	/** The host machineId (see `hosts.list()`). */
	hostId: string;
	/** Command to run to wake the host, or `null` to clear it. */
	wakeCommand: string | null;
}

export interface HostSetWakeCommandResult {
	success: boolean;
}

export declare namespace Hosts {
	export type {
		Host,
		HostListResponse,
		HostSetWakeCommandParams,
		HostSetWakeCommandResult,
	};
}
