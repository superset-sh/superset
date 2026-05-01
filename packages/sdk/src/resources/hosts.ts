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
			"host.list",
			{ organizationId: this._requireOrgId() },
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
	organizationId: string;
}

export type HostListResponse = Array<Host>;

export declare namespace Hosts {
	export type { Host, HostListResponse };
}
