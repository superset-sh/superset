# Multi-Worktree Development Plan

Enable running multiple dev instances of the desktop app simultaneously across different worktrees.

## Problem

Running multiple dev instances fails due to shared resources:

| Resource | Issue |
|----------|-------|
| Single instance lock | 2nd instance exits immediately |
| Home directory | Shared → DB/state conflicts |
| Terminal daemon | Single socket → terminal conflicts |
| Ports | Fixed ports → binding fails |
| App name | All same name → OS confusion |

## Solution

Use `SUPERSET_WORKSPACE_NAME` (already set by Superset terminals) + `SUPERSET_PORT_BASE` (new, allocated by parent) to isolate resources.

```
SUPERSET_WORKSPACE_NAME set?
  ├─ Yes → ~/.superset-{name}/  + allocated ports + no instance lock
  └─ No  → ~/.superset/         + default ports + instance lock
```

**Workflow:** Always run `bun dev` inside a Superset terminal.

---

## Implementation

### 1. Database: Add `portBase` to workspace table

**File:** `packages/local-db/src/schema.ts`

```typescript
// Add to workspaces table
portBase: integer("port_base"),
```

### 2. Port allocation on workspace create

**File:** `apps/desktop/src/lib/trpc/routers/workspaces/workspaces.ts`

```typescript
const START_PORT = 3000;
const PORT_RANGE = 10;

async function allocatePortBase(db: Database): Promise<number> {
  // Get all existing portBase values, sorted
  const existing = await db
    .select({ portBase: workspaces.portBase })
    .from(workspaces)
    .where(isNotNull(workspaces.portBase))
    .orderBy(workspaces.portBase);

  const usedBases = new Set(existing.map(w => w.portBase));

  // Find first available slot
  let candidate = START_PORT;
  while (usedBases.has(candidate)) {
    candidate += PORT_RANGE;
  }

  return candidate;
}

// In workspace create:
const portBase = await allocatePortBase(db);
await db.insert(workspaces).values({
  ...workspaceData,
  portBase,
});
```

**Result:** Deleted workspaces free up their port range for reuse.

### 3. Pass to terminal env

**File:** `apps/desktop/src/main/lib/terminal/env.ts`

```typescript
// In buildTerminalEnv(), add:
SUPERSET_PORT_BASE: String(workspace.portBase),
```

### 4. setup.sh calculates all ports and writes to .env

**File:** `.superset/setup.sh`

```bash
# In step_write_env(), add port configuration:

if [ -n "${SUPERSET_PORT_BASE:-}" ]; then
  BASE=$SUPERSET_PORT_BASE

  # App ports (fixed offsets from base)
  WEB_PORT=$((BASE))
  API_PORT=$((BASE + 1))
  MARKETING_PORT=$((BASE + 2))
  ADMIN_PORT=$((BASE + 3))
  DOCS_PORT=$((BASE + 4))
  DESKTOP_VITE_PORT=$((BASE + 5))
  DESKTOP_NOTIFICATIONS_PORT=$((BASE + 6))

  {
    echo ""
    echo "# Workspace Ports (allocated from SUPERSET_PORT_BASE=$BASE)"
    echo "SUPERSET_PORT_BASE=$BASE"
    echo "WEB_PORT=$WEB_PORT"
    echo "API_PORT=$API_PORT"
    echo "MARKETING_PORT=$MARKETING_PORT"
    echo "ADMIN_PORT=$ADMIN_PORT"
    echo "DOCS_PORT=$DOCS_PORT"
    echo "DESKTOP_VITE_PORT=$DESKTOP_VITE_PORT"
    echo "DESKTOP_NOTIFICATIONS_PORT=$DESKTOP_NOTIFICATIONS_PORT"
    echo ""
    echo "# Cross-app URLs"
    echo "NEXT_PUBLIC_API_URL=http://localhost:$API_PORT"
    echo "NEXT_PUBLIC_WEB_URL=http://localhost:$WEB_PORT"
    echo "EXPO_PUBLIC_WEB_URL=http://localhost:$WEB_PORT"
    echo "EXPO_PUBLIC_API_URL=http://localhost:$API_PORT"
    echo "NEXT_PUBLIC_DESKTOP_URL=http://localhost:$DESKTOP_VITE_PORT"
  } >> .env
fi
```

### 4b. Update app dev scripts to use env vars

**Install dotenv-cli:**
```bash
bun add -D dotenv-cli -w
```

**Update each app's package.json:**

```json
// apps/web/package.json
"dev": "dotenv -- next dev --port ${WEB_PORT:-3000}"

// apps/api/package.json
"dev": "dotenv -- next dev --port ${API_PORT:-3001}"

// apps/marketing/package.json
"dev": "dotenv -- next dev --port ${MARKETING_PORT:-3002}"

// apps/admin/package.json
"dev": "dotenv -- next dev --port ${ADMIN_PORT:-3003}"

// apps/docs/package.json
"dev": "dotenv -- next dev --port ${DOCS_PORT:-3004}"
```

**Note:** Defaults (3000, 3001, etc.) preserved for running outside Superset.

### 4c. Fix API CORS for dynamic desktop port

**Note:** Auth (`packages/auth/src/server.ts`) already reads `NEXT_PUBLIC_DESKTOP_URL` from env vars for `trustedOrigins`, so writing it in setup.sh is sufficient.

**File:** `apps/api/src/env.ts` (add to client schema)

```typescript
// Add to client schema:
NEXT_PUBLIC_DESKTOP_URL: z.string().url().optional(),

// Add to experimental__runtimeEnv:
NEXT_PUBLIC_DESKTOP_URL: process.env.NEXT_PUBLIC_DESKTOP_URL,
```

**File:** `apps/api/src/proxy.ts` (remove hardcoded port)

```typescript
const allowedOrigins = [
  env.NEXT_PUBLIC_WEB_URL,
  env.NEXT_PUBLIC_ADMIN_URL,
  // Use env var instead of hardcoded port for desktop dev server
  env.NEXT_PUBLIC_DESKTOP_URL,
].filter(Boolean);
```

### 4d. Fix desktop Vite config helper

**File:** `apps/desktop/vite/helpers.ts`

```typescript
// Read from env var instead of hardcoded value
export const DEV_SERVER_PORT = Number(process.env.DESKTOP_VITE_PORT) || 5927;
```

### 5. Desktop app reads port base

**File:** `apps/desktop/src/shared/worktree-id.ts` (new)

```typescript
/**
 * Get workspace name for instance isolation.
 */
export function getWorkspaceName(): string | undefined {
  const name = process.env.SUPERSET_WORKSPACE_NAME;
  if (!name) return undefined;
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 32);
}

/**
 * Get allocated port base for this workspace.
 */
export function getPortBase(): number {
  const base = process.env.SUPERSET_PORT_BASE;
  if (base) {
    const parsed = Number(base);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 3000; // default
}
```

### 6. Use dynamic ports

**File:** `apps/desktop/src/shared/constants.ts`

```typescript
import { env } from "./env.shared";

// Read from env vars set by setup.sh, with defaults for outside Superset
export const PORTS = {
  VITE_DEV_SERVER: Number(env.DESKTOP_VITE_PORT) || 5927,
  NOTIFICATIONS: Number(env.DESKTOP_NOTIFICATIONS_PORT) || 31416,
  // Electric comes from ELECTRIC_PORT env var (set by setup.sh via Docker)
};
```

**File:** `apps/desktop/src/shared/env.shared.ts` (add new vars)

```typescript
// Add to the env schema:
DESKTOP_VITE_PORT: z.string().optional(),
DESKTOP_NOTIFICATIONS_PORT: z.string().optional(),
SUPERSET_PORT_BASE: z.string().optional(),
```

### 7. Home directory isolation

**File:** `apps/desktop/src/shared/constants.ts`

```typescript
import { getWorkspaceName } from "./worktree-id";

export function getSupersetDirName(): string {
  const workspace = getWorkspaceName();
  if (workspace) {
    return `.superset-${workspace}`;
  }
  return ".superset";
}

export const SUPERSET_DIR_NAME = getSupersetDirName();
```

### 8. App name

**File:** `apps/desktop/src/main/index.ts`

```typescript
import { getWorkspaceName } from "shared/worktree-id";

const workspace = getWorkspaceName();
if (workspace) {
  app.setName(`Superset (${workspace})`);
}
```

### 9. Single instance lock

**File:** `apps/desktop/src/main/index.ts`

```typescript
const workspace = getWorkspaceName();

// Only enforce lock when not in a named workspace
if (!workspace) {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.exit(0);
  }
}
```

### 10. Vite config

**File:** `apps/desktop/electron.vite.config.ts`

```typescript
import { PORTS } from "./src/shared/constants";

// In renderer config:
server: {
  port: PORTS.VITE_DEV_SERVER,
  strictPort: true,
}
```

### 11. Update terminal-host paths

**File:** `apps/desktop/src/main/lib/terminal-host/client.ts`

```typescript
import { SUPERSET_DIR_NAME } from "shared/constants";

const SUPERSET_HOME_DIR = join(homedir(), SUPERSET_DIR_NAME);
```

**File:** `apps/desktop/src/main/lib/app-environment.ts`

```typescript
import { SUPERSET_DIR_NAME } from "shared/constants";

export const SUPERSET_HOME_DIR = join(homedir(), SUPERSET_DIR_NAME);
```

---

## Files Summary

### Database & Allocation
| File | Change |
|------|--------|
| `packages/local-db/src/schema.ts` | Add `portBase` column |
| `apps/desktop/src/lib/trpc/routers/workspaces/workspaces.ts` | Port allocation logic |

### Desktop App
| File | Change |
|------|--------|
| `apps/desktop/src/shared/worktree-id.ts` | **New** - `getWorkspaceName()` |
| `apps/desktop/src/shared/env.shared.ts` | Add port env vars to schema |
| `apps/desktop/src/shared/constants.ts` | Dynamic `SUPERSET_DIR_NAME` and `PORTS` |
| `apps/desktop/src/main/lib/terminal/env.ts` | Add `SUPERSET_PORT_BASE` to terminal env |
| `apps/desktop/src/main/lib/app-environment.ts` | Import from constants |
| `apps/desktop/src/main/lib/terminal-host/client.ts` | Import from constants |
| `apps/desktop/src/main/index.ts` | Conditional app name + instance lock |
| `apps/desktop/electron.vite.config.ts` | Dynamic Vite port |

### Setup Script
| File | Change |
|------|--------|
| `.superset/setup.sh` | Calculate all ports, write to .env (including `NEXT_PUBLIC_DESKTOP_URL`) |

### API CORS
| File | Change |
|------|--------|
| `apps/api/src/env.ts` | Add `NEXT_PUBLIC_DESKTOP_URL` to client schema |
| `apps/api/src/proxy.ts` | Replace hardcoded `localhost:5927` with env var |

### Desktop Vite Config
| File | Change |
|------|--------|
| `apps/desktop/vite/helpers.ts` | Read `DEV_SERVER_PORT` from env var |

### App Dev Scripts
| File | Change |
|------|--------|
| `package.json` (root) | Add `dotenv-cli` dev dependency |
| `apps/web/package.json` | Use `dotenv -- next dev --port ${WEB_PORT:-3000}` |
| `apps/api/package.json` | Use `dotenv -- next dev --port ${API_PORT:-3001}` |
| `apps/marketing/package.json` | Use `dotenv -- next dev --port ${MARKETING_PORT:-3002}` |
| `apps/admin/package.json` | Use `dotenv -- next dev --port ${ADMIN_PORT:-3003}` |
| `apps/docs/package.json` | Use `dotenv -- next dev --port ${DOCS_PORT:-3004}` |

---

## Cleanup

Remove old dev/prod separation:
- `SUPERSET_DIR_NAMES.DEV` / `SUPERSET_DIR_NAMES.PROD` constants
- `NODE_ENV === "development"` checks for dir name
- Hardcoded dev vs prod port offsets

---

## Port Allocation Example

| Workspace | portBase | web | api | marketing | admin | docs | desktop-vite | desktop-notif |
|-----------|----------|-----|-----|-----------|-------|------|--------------|---------------|
| feature-a | 3000 | 3000 | 3001 | 3002 | 3003 | 3004 | 3005 | 3006 |
| feature-b | 3010 | 3010 | 3011 | 3012 | 3013 | 3014 | 3015 | 3016 |
| (delete a) | - | - | - | - | - | - | - | - |
| feature-c | 3000 | 3000 | 3001 | 3002 | 3003 | 3004 | 3005 | 3006 | (reused)
| feature-d | 3020 | 3020 | 3021 | 3022 | 3023 | 3024 | 3025 | 3026 |

---

## Testing

1. Open Superset, create workspace `test-a`
2. Check workspace has `portBase` allocated (e.g., 3000)
3. In terminal: `echo $SUPERSET_PORT_BASE` → 3000
4. Run `setup.sh`, check `.env`:
   ```
   SUPERSET_PORT_BASE=3000
   WEB_PORT=3000
   API_PORT=3001
   NEXT_PUBLIC_API_URL=http://localhost:3001
   NEXT_PUBLIC_DESKTOP_URL=http://localhost:3005
   ...
   ```
5. Run `bun dev` in apps/web → runs on port 3000
6. Run `bun dev` in apps/desktop → creates `~/.superset-test-a/`, uses port 3005
7. Create workspace `test-b`, repeat → different ports, both run simultaneously
8. Delete `test-a`, create `test-c` → should reuse port base 3000
