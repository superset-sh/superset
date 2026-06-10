# Local KV REST

Tiny local Upstash Redis REST-compatible shim for the Superset Docker stack.

It exists so local Relay and rate-limit code can use `@upstash/redis` against a
Docker Redis instance instead of fake `KV_REST_API_URL` values.

The shim forwards command arrays to Redis over RESP and returns Upstash-shaped
JSON responses, including base64 response encoding when requested by the SDK.
