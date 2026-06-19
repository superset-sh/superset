# Event Taxonomy

Blueprint refs: P1, P2, P6, P8, P19.

Status: seed. Add events only through typed helpers/proxy; do not scatter vendor SDK calls.

| Event | Journey | When | Required fields | Forbidden fields |
| --- | --- | --- | --- | --- |
| `superset.journey_started` | TBD | User/system intent accepted | `correlation_id`, `surface`, `environment`, `app_version` | raw content, token, email, phone |
| `superset.journey_completed` | TBD | Business success confirmed | `correlation_id`, `result`, `success` | raw content, token, email, phone |
| `superset.journey_failed` | TBD | Bounded failure class known | `correlation_id`, `error_class`, `success` | raw error message as label |
