# Plan: Add Persistence to Terminal Presets

## Goal
Add the ability to load and save terminal presets to the LowDB database (`~/.superset/db.json`). Presets will be stored **globally** in `settings.terminalPresets`.

---

## Backwards Compatibility

**The implementation MUST maintain backwards compatibility:**

1. **Optional field** - `terminalPresets` must be optional (`terminalPresets?: TerminalPreset[]`)
2. **Null-safe reads** - Always use `?? []` fallback when reading presets
3. **Lazy initialization** - Only create the array when first preset is added
4. **No migration required** - Existing databases without `terminalPresets` will work seamlessly

```typescript
// ✅ CORRECT - Always handle missing field
const presets = db.data.settings.terminalPresets ?? [];

// ❌ WRONG - Will crash on existing databases
const presets = db.data.settings.terminalPresets;
```

---

## Files to Modify

### 1. Database Schema
**File:** `apps/desktop/src/main/lib/db/schemas.ts`

Add `TerminalPreset` interface after line 97 (after `ExternalApp` type):

```typescript
export interface TerminalPreset {
  id: string;
  name: string;
  cwd: string;
  commands: string[];
}
```

Update `Settings` interface (lines 99-102) to add optional `terminalPresets`:

```typescript
export interface Settings {
  lastActiveWorkspaceId?: string;
  lastUsedApp?: ExternalApp;
  terminalPresets?: TerminalPreset[];  // ADD THIS LINE
}
```

**DO NOT modify `defaultDatabase`** - keep `settings: {}` as-is since the field is optional.

---

### 2. tRPC Settings Router
**File:** `apps/desktop/src/lib/trpc/routers/settings/index.ts`

Add imports at the top:

```typescript
import { z } from "zod";
import { nanoid } from "nanoid";
```

Add four procedures to the router (after `getLastUsedApp`):

```typescript
export const createSettingsRouter = () => {
  return router({
    getLastUsedApp: publicProcedure.query(() => {
      return db.data.settings.lastUsedApp ?? "cursor";
    }),

    // --- ADD THESE PROCEDURES ---

    getTerminalPresets: publicProcedure.query(() => {
      return db.data.settings.terminalPresets ?? [];
    }),

    createTerminalPreset: publicProcedure
      .input(
        z.object({
          name: z.string(),
          cwd: z.string(),
          commands: z.array(z.string()),
        }),
      )
      .mutation(async ({ input }) => {
        const preset = {
          id: nanoid(),
          ...input,
        };

        await db.update((data) => {
          if (!data.settings.terminalPresets) {
            data.settings.terminalPresets = [];
          }
          data.settings.terminalPresets.push(preset);
        });

        return preset;
      }),

    updateTerminalPreset: publicProcedure
      .input(
        z.object({
          id: z.string(),
          patch: z.object({
            name: z.string().optional(),
            cwd: z.string().optional(),
            commands: z.array(z.string()).optional(),
          }),
        }),
      )
      .mutation(async ({ input }) => {
        await db.update((data) => {
          const presets = data.settings.terminalPresets ?? [];
          const preset = presets.find((p) => p.id === input.id);

          if (!preset) {
            throw new Error(`Preset ${input.id} not found`);
          }

          if (input.patch.name !== undefined) preset.name = input.patch.name;
          if (input.patch.cwd !== undefined) preset.cwd = input.patch.cwd;
          if (input.patch.commands !== undefined) preset.commands = input.patch.commands;
        });

        return { success: true };
      }),

    deleteTerminalPreset: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await db.update((data) => {
          const presets = data.settings.terminalPresets ?? [];
          data.settings.terminalPresets = presets.filter((p) => p.id !== input.id);
        });

        return { success: true };
      }),
  });
};
```

---

### 3. React Query Mutation Hooks
**New folder:** `apps/desktop/src/renderer/react-query/presets/`

Create 4 files following the existing pattern from `workspaces/useUpdateWorkspace.ts`:

**File: `useCreateTerminalPreset.ts`**
```typescript
import { trpc } from "renderer/lib/trpc";

export function useCreateTerminalPreset(
  options?: Parameters<typeof trpc.settings.createTerminalPreset.useMutation>[0],
) {
  const utils = trpc.useUtils();

  return trpc.settings.createTerminalPreset.useMutation({
    ...options,
    onSuccess: async (...args) => {
      await utils.settings.getTerminalPresets.invalidate();
      await options?.onSuccess?.(...args);
    },
  });
}
```

**File: `useUpdateTerminalPreset.ts`**
```typescript
import { trpc } from "renderer/lib/trpc";

export function useUpdateTerminalPreset(
  options?: Parameters<typeof trpc.settings.updateTerminalPreset.useMutation>[0],
) {
  const utils = trpc.useUtils();

  return trpc.settings.updateTerminalPreset.useMutation({
    ...options,
    onSuccess: async (...args) => {
      await utils.settings.getTerminalPresets.invalidate();
      await options?.onSuccess?.(...args);
    },
  });
}
```

**File: `useDeleteTerminalPreset.ts`**
```typescript
import { trpc } from "renderer/lib/trpc";

export function useDeleteTerminalPreset(
  options?: Parameters<typeof trpc.settings.deleteTerminalPreset.useMutation>[0],
) {
  const utils = trpc.useUtils();

  return trpc.settings.deleteTerminalPreset.useMutation({
    ...options,
    onSuccess: async (...args) => {
      await utils.settings.getTerminalPresets.invalidate();
      await options?.onSuccess?.(...args);
    },
  });
}
```

**File: `index.ts`**
```typescript
export { useCreateTerminalPreset } from "./useCreateTerminalPreset";
export { useUpdateTerminalPreset } from "./useUpdateTerminalPreset";
export { useDeleteTerminalPreset } from "./useDeleteTerminalPreset";
```

---

### 4. Component Types
**File:** `apps/desktop/src/renderer/screens/main/components/SettingsView/PresetsSettings/types.ts`

Replace local `TerminalPreset` interface with import:

```typescript
// REMOVE this local interface:
// export interface TerminalPreset {
//   id: string;
//   name: string;
//   cwd: string;
//   commands: string[];
// }

// ADD this import instead:
import type { TerminalPreset } from "main/lib/db/schemas";

// Re-export for convenience
export type { TerminalPreset };
```

Remove `MOCK_PRESETS` constant entirely - no longer needed.

Keep these unchanged:
- `PresetColumnKey`
- `PresetColumnConfig`
- `PRESET_COLUMNS`
- `createEmptyPreset()`

---

### 5. PresetsSettings Component
**File:** `apps/desktop/src/renderer/screens/main/components/SettingsView/PresetsSettings/PresetsSettings.tsx`

**Update imports:**
```typescript
import { Button } from "@superset/ui/button";
import { HiOutlinePlus } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import {
  useCreateTerminalPreset,
  useUpdateTerminalPreset,
  useDeleteTerminalPreset,
} from "renderer/react-query/presets";
import { PresetRow } from "./PresetRow";
import {
  PRESET_COLUMNS,
  type PresetColumnKey,
} from "./types";
```

**Replace component body:**
```typescript
export function PresetsSettings() {
  // Fetch presets from database
  const { data: presets = [], isLoading } = trpc.settings.getTerminalPresets.useQuery();

  // Mutation hooks
  const createPreset = useCreateTerminalPreset();
  const updatePreset = useUpdateTerminalPreset();
  const deletePreset = useDeleteTerminalPreset();

  const handleCellChange = (
    rowIndex: number,
    column: PresetColumnKey,
    value: string,
  ) => {
    const preset = presets[rowIndex];
    if (!preset) return;

    updatePreset.mutate({
      id: preset.id,
      patch: { [column]: value },
    });
  };

  const handleCommandsChange = (rowIndex: number, commands: string[]) => {
    const preset = presets[rowIndex];
    if (!preset) return;

    updatePreset.mutate({
      id: preset.id,
      patch: { commands },
    });
  };

  const handleAddRow = () => {
    createPreset.mutate({
      name: "",
      cwd: "",
      commands: [""],
    });
  };

  const handleDeleteRow = (rowIndex: number) => {
    const preset = presets[rowIndex];
    if (!preset) return;

    deletePreset.mutate({ id: preset.id });
  };

  if (isLoading) {
    return (
      <div className="p-6 w-full max-w-6xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    // ... rest of JSX unchanged
  );
}
```

---

## Implementation Checklist

- [ ] Add `TerminalPreset` interface to `schemas.ts`
- [ ] Update `Settings` interface with optional `terminalPresets` field
- [ ] Add 4 tRPC procedures to settings router
- [ ] Create `presets/` folder with 3 mutation hooks + index
- [ ] Update `types.ts` to import shared type, remove mock data
- [ ] Update `PresetsSettings.tsx` to use tRPC
- [ ] Test: Create preset → verify in `~/.superset/db.json`
- [ ] Test: Restart app → verify presets load correctly
- [ ] Test: Existing db without `terminalPresets` → verify no crash

---

## Testing Backwards Compatibility

1. **Before implementation:** Copy existing `~/.superset/db.json` as backup
2. **After implementation:**
   - Start app with OLD db.json (no `terminalPresets` field)
   - Verify app loads without errors
   - Add a preset
   - Verify `terminalPresets` array is created in db.json
   - Restart app, verify preset persists
