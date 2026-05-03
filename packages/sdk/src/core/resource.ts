// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import type { Superset } from "../client";

export abstract class APIResource {
	protected _client: Superset;

	constructor(client: Superset) {
		this._client = client;
	}
}
