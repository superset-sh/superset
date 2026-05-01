# Superset TypeScript SDK

```ts
import Superset from '@superset/sdk';

const client = new Superset({ apiKey: process.env.SUPERSET_API_KEY });

// Create
const task = await client.tasks.create({
  title: 'Wire up auth',
  priority: 'high',
});

// Slice and dice — every filter combines with AND
const mine = await client.tasks.list({ assigneeMe: true, priority: 'high' });
const search = await client.tasks.list({ search: 'auth', limit: 20 });

// Retrieve by id or slug
const fetched = await client.tasks.retrieve('SUPER-172');

// Update / delete
await client.tasks.update({ id: task.id, statusId: '<uuid>' });
await client.tasks.delete(task.id);
```

## Configuration

```ts
const client = new Superset({
  apiKey: 'sk_live_…',           // or process.env.SUPERSET_API_KEY
  baseURL: 'https://api.superset.sh',
  timeout: 60_000,
  maxRetries: 2,
});
```

API keys starting with `sk_live_` or `sk_test_` are sent as `x-api-key`;
anything else is sent as `Authorization: Bearer <token>`.

## Errors

```ts
import { APIError, NotFoundError, RateLimitError } from '@superset/sdk';

try {
  await client.tasks.retrieve('missing');
} catch (err) {
  if (err instanceof NotFoundError) { /* 404 */ }
  if (err instanceof RateLimitError) { /* 429 */ }
  if (err instanceof APIError) { /* anything else */ }
}
```
