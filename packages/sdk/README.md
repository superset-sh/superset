# Superset TypeScript SDK

Typed wrapper around the Superset API for cloud workspaces: sandboxes Superset runs for your organization, and the terminals and agents inside them. Follows the [`superset` CLI](https://docs.superset.sh/docs/cli/getting-started) — same procedures, same shapes.

Full docs: **<https://docs.superset.sh/docs/sdk/getting-started>**

## Install

```bash
npm install @superset_sh/sdk
# or: bun add @superset_sh/sdk
```

## Quickstart

```ts
import Superset from '@superset_sh/sdk';

const client = new Superset({
  apiKey: process.env.SUPERSET_API_KEY,             // sk_live_…
  organizationId: process.env.SUPERSET_ORGANIZATION_ID, // required for most resources
});

// Start a cloud workspace from an environment, with an agent on first boot
const workspace = await client.workspaces.create({
  environment: 'web',          // id or name; defaults to the first with repositories
  agent: 'claude',
  prompt: 'Fix the flaky login test',
});

// Provisioning runs in the background: wait for `ready`
let current = workspace;
while (current.status === 'provisioning') {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const next = await client.workspaces.retrieve(workspace.id);
  if (!next) throw new Error('Workspace was deleted');
  current = next;
}
if (current.status !== 'ready') throw new Error(`Workspace is ${current.status}`);

// Drive it: open a terminal, launch another agent, read its screen
const { terminalId } = await client.terminals.create({ workspaceId: workspace.id, command: 'bun test' });
const { sessionId } = await client.agents.create({ workspaceId: workspace.id, agent: 'codex', prompt: 'Review the diff' });
const screen = await client.terminals.read({ workspaceId: workspace.id, terminalId: sessionId });

// Tasks
const task = await client.tasks.create({ title: 'Wire up auth', priority: 'high' });
await client.tasks.update({ id: task.id, statusId: '<uuid>' });

// Tear the sandbox down when you are done
await client.workspaces.delete(workspace.id);
```

Both `apiKey` and `organizationId` are picked up automatically from `SUPERSET_API_KEY` / `SUPERSET_ORGANIZATION_ID` environment variables — you can omit them in the constructor.

Find your `organizationId` via `superset organization list` in the CLI, or in the URL of any org dashboard.

## Configuration

```ts
const client = new Superset({
  apiKey: 'sk_live_…',
  organizationId: '…',
  baseURL: 'https://api.superset.sh',     // override for staging / self-hosted
  timeout: 60_000,
  maxRetries: 2,
  logLevel: 'warn',                       // 'off' | 'error' | 'warn' | 'info' | 'debug'
});
```

Keys starting with `sk_live_` or `sk_test_` are sent as `x-api-key`; anything else as `Authorization: Bearer <token>`.

## Errors

```ts
import { APIError, NotFoundError, RateLimitError } from '@superset_sh/sdk';

try {
  await client.tasks.create({ title: '' });
} catch (err) {
  if (err instanceof RateLimitError) { /* 429 — already retried up to maxRetries */ }
  if (err instanceof APIError)       { /* err.status, err.headers, err.error (parsed body) */ }
}
```

## Two transport paths

Most methods hit `api.superset.sh` directly. `terminals.*` and `agents.create` run inside a workspace's sandbox: the SDK asks the API for a short-lived ticket for that workspace (waking its sandbox if it had stopped), caches it, and calls the sandbox through Superset's gate with it. Your API key is only ever sent to the API.

The workspace must be `ready`; otherwise the ticket request fails with a `412`.

## License

Apache-2.0
