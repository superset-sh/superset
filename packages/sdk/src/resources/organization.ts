import type { APIPromise } from "../core/api-promise";
import { APIResource } from "../core/resource";
import type { RequestOptions } from "../internal/request-options";

export class Members extends APIResource {
	/**
	 * List members of the active organization.
	 *
	 * Mirrors `superset organization members list`.
	 */
	list(
		query?: MemberListParams | null,
		options?: RequestOptions,
	): APIPromise<MemberListResponse> {
		return this._client.query<MemberListResponse>(
			"organization.members.list",
			query ?? undefined,
			options,
		);
	}
}

export class Organization extends APIResource {
	/**
	 * Member listing for the active organization. Member add/remove
	 * intentionally lives in the app — the programmatic API is read-only.
	 */
	members: Members = new Members(this._client);
}

export type OrganizationRole = "member" | "admin" | "owner";

export interface Member {
	id: string;
	name: string | null;
	email: string;
	image: string | null;
	role: OrganizationRole;
}

export type MemberListResponse = Array<Member>;

export interface MemberListParams {
	search?: string | null;
	limit?: number;
}

export declare namespace Organization {
	export type {
		Member,
		MemberListParams,
		MemberListResponse,
		OrganizationRole,
	};
}
