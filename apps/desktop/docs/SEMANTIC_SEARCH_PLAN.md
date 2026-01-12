# Semantic Search with Embeddings - Local-First Architecture

## Overview

Implement semantic search for tasks using text embeddings, with a **local-first architecture** that keeps the embedding model in the desktop app's main process. This enables offline search while maintaining snappy UI updates through fire-and-forget embedding computation.

## Architecture

### High-Level Flow

```
Server (Linear Sync):
  Linear task → generate embedding → store in DB
    ↓
  ElectricSQL syncs task + embedding to desktop
    ↓
Desktop has embedding ready for search

Desktop (User-Created Tasks):
  User creates task → insert to TanStack DB (no embedding yet)
    ↓
  Fire-and-forget tRPC call → main process computes embedding
    ↓
  Main returns embedding → update TanStack DB
    ↓
  ElectricSQL syncs back to server

Desktop (Search):
  User types "auth bug" → tRPC call to main process
    ↓
  Main generates query embedding → returns to renderer
    ↓
  Renderer: cosine similarity against task embeddings
    ↓
  Sorted results displayed
```

### Key Design Decisions

1. **Model Location**: Main process (shared across all renderer operations, doesn't block UI)
2. **Task Embeddings**: Generated server-side during Linear sync, locally for user-created tasks
3. **Query Embeddings**: Generated on-demand in main process via tRPC
4. **Search Execution**: In-memory cosine similarity in renderer (fast, no IPC overhead)
5. **Optimistic Updates**: Tasks created without embeddings, embedding added async (fire-and-forget)

---

## Current State

### Database Schema
- ❌ No `embedding` column on tasks table
- ✅ Tasks table has: id, title, description, slug, statusId, priority, etc.
- ✅ Uses jsonb for labels (can use same for embeddings)

### API Sync
- ✅ Linear sync working (`performInitialSync()`)
- ✅ Batch inserts 100 tasks at a time
- ❌ No embedding generation during sync

### Desktop App
- ✅ tRPC setup with `ipcLink` for renderer-main communication
- ✅ Collections using ElectricSQL for real-time sync
- ✅ Update pattern: `collections.tasks.update(id, draft => { ... })`
- ❌ No embedding model loaded
- ❌ No tRPC endpoint for embedding computation

### Current Search
- ✅ TanStack Table globalFilter
- ✅ Simple substring matching on title + slug
- ❌ No semantic search
- ❌ No relevance ranking

---

## Implementation Plan

### Phase 1: Database Schema Update

**Goal**: Add embedding storage to tasks table

#### Step 1.1: Update Schema
**File**: `packages/db/src/schema/schema.ts`

Add embedding column to tasks table:
```typescript
export const tasks = pgTable(
  "tasks",
  {
    // ... existing fields

    // NEW: Text embedding for semantic search
    embedding: jsonb("embedding").$type<number[]>(),

    // ... rest of fields
  },
  // ... indexes
);
```

#### Step 1.2: Generate and Push Migration

**Note**: You will handle generating and pushing the migration yourself.

After updating the schema in Step 1.1, you should:
1. Spin up a new Neon branch
2. Update `.env` files to point at the Neon branch locally
3. Generate migration: `pnpm drizzle-kit generate --name="add_task_embeddings"`
4. Review and push the migration

**Verification**:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tasks' AND column_name = 'embedding';
```

---

### Phase 2: API - Embedding Generation During Sync

**Goal**: Generate embeddings server-side during Linear sync

#### Step 2.1: Install Dependencies
```bash
cd apps/api
bun add @xenova/transformers
```

#### Step 2.2: Create Embedding Utility
**File**: `apps/api/src/app/api/integrations/linear/jobs/initial-sync/utils/embeddings.ts` (NEW)

```typescript
import { pipeline } from '@xenova/transformers';

let embedder: Awaited<ReturnType<typeof pipeline>> | null = null;

/**
 * Lazily loads the embedding model (downloads ~90MB once, then caches)
 */
export async function getEmbedder() {
  if (!embedder) {
    console.log("[embeddings] Loading model: Xenova/all-MiniLM-L6-v2");
    embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
    console.log("[embeddings] Model loaded successfully");
  }
  return embedder;
}

/**
 * Generates embedding for a task (combines title + description + labels)
 */
export async function generateTaskEmbedding(
  title: string,
  description: string | null,
  labels: string[] = []
): Promise<number[]> {
  const model = await getEmbedder();

  // Combine title, description, and labels for richer embeddings
  const parts = [title, description, ...labels].filter(Boolean);
  const text = parts.join(' ');

  const result = await model(text, {
    pooling: 'mean',
    normalize: true,
  });

  return Array.from(result.data);
}
```

#### Step 2.3: Update mapIssueToTask
**File**: `apps/api/src/app/api/integrations/linear/jobs/initial-sync/utils.ts`

Update signature to accept embeddings:
```typescript
export function mapIssueToTask(
  issue: LinearIssue,
  organizationId: string,
  creatorId: string,
  userByEmail: Map<string, string>,
  statusByExternalId: Map<string, string>,
  embedding: number[], // NEW parameter
) {
  return {
    // ... existing fields
    embedding, // NEW field
    // ... rest of fields
  };
}
```

#### Step 2.4: Update performInitialSync
**File**: `apps/api/src/app/api/integrations/linear/jobs/initial-sync/route.ts`

Generate embeddings using **batch processing** (more efficient than Promise.all):
```typescript
async function performInitialSync(
  client: LinearClient,
  organizationId: string,
  creatorUserId: string,
) {
  // ... existing workflow state sync

  // Fetch issues
  const issues = await fetchAllIssues(client);

  // Generate embeddings in BATCH (more efficient than individual calls)
  console.log(`[initial-sync] Generating embeddings for ${issues.length} issues`);

  const embedder = await getEmbedder();

  // Prepare all texts at once
  const texts = issues.map(issue => {
    const parts = [
      issue.title,
      issue.description,
      ...issue.labels.nodes.map(l => l.name)
    ].filter(Boolean);
    return parts.join(' ');
  });

  // Single batched call (faster than individual promises)
  const result = await embedder(texts, {
    pooling: 'mean',
    normalize: true,
  });

  // Convert to array of embeddings
  const embeddings: number[][] = [];
  const embeddingDim = 384; // all-MiniLM-L6-v2 dimension
  for (let i = 0; i < issues.length; i++) {
    const start = i * embeddingDim;
    const end = start + embeddingDim;
    embeddings.push(Array.from(result.data.slice(start, end)));
  }

  console.log("[initial-sync] Embeddings generated");

  // Map issues to tasks WITH embeddings
  const mappedTasks = issues.map((issue, index) =>
    mapIssueToTask(
      issue,
      organizationId,
      creatorUserId,
      userByEmail,
      statusByExternalId,
      embeddings[index] // Pass pre-computed embedding
    )
  );

  // ... rest of batch insert logic
}
```

**Why batch?** Transformers.js processes batches much faster than individual calls - ~2-3x speedup for 100+ tasks.

---

### Phase 3: Desktop Main Process - Embedding Model & tRPC Endpoint

**Goal**: Load embedding model in main process, expose tRPC endpoint for renderer

#### Step 3.1: Install Dependencies
```bash
cd apps/desktop
bun add @xenova/transformers
```

#### Step 3.2: Create Embedding Service
**File**: `apps/desktop/src/main/lib/embeddings.ts` (NEW)

```typescript
import { pipeline } from '@xenova/transformers';

let embedder: Awaited<ReturnType<typeof pipeline>> | null = null;

/**
 * Initialize the embedding model (call on app startup)
 * Downloads ~90MB model on first run, then caches locally
 */
export async function initEmbeddings() {
  if (!embedder) {
    console.log("[embeddings] Loading model: Xenova/all-MiniLM-L6-v2");
    embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
    console.log("[embeddings] Model loaded and cached");
  }
  return embedder;
}

/**
 * Generate embedding for text (task or query)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const model = await initEmbeddings();

  const result = await model(text, {
    pooling: 'mean',
    normalize: true,
  });

  return Array.from(result.data);
}
```

#### Step 3.3: Load Model on Startup
**File**: `apps/desktop/src/main/index.ts`

Add to app initialization:
```typescript
import { initEmbeddings } from './lib/embeddings';

app.whenReady().then(async () => {
  // ... existing initialization

  // Pre-load embedding model (async, doesn't block window creation)
  console.log("[main] Pre-loading embedding model...");
  initEmbeddings().catch(error => {
    console.error("[main] Failed to load embedding model:", error);
  });

  // ... create window
});
```

#### Step 3.4: Create tRPC Router for Embeddings
**File**: `apps/desktop/src/lib/trpc/routers/embeddings/index.ts` (NEW)

```typescript
import { z } from 'zod';
import { router, publicProcedure } from '../../index';
import { generateEmbedding } from '../../../../main/lib/embeddings';

export const createEmbeddingsRouter = () => {
  return router({
    /**
     * Generate embedding for a text string (task or search query)
     */
    compute: publicProcedure
      .input(z.object({
        text: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const embedding = await generateEmbedding(input.text);
        return { embedding };
      }),
  });
};
```

#### Step 3.5: Register Router
**File**: `apps/desktop/src/lib/trpc/index.ts`

Add embeddings router:
```typescript
import { createEmbeddingsRouter } from './routers/embeddings';

export const appRouter = router({
  // ... existing routers
  embeddings: createEmbeddingsRouter(),
});

export type AppRouter = typeof appRouter;
```

---

### Phase 4: Desktop Renderer - Fire-and-Forget Embedding Updates

**Goal**: Compute embeddings for user-created/updated tasks asynchronously

#### Step 4.1: Create Embedding Helper
**File**: `apps/desktop/src/renderer/hooks/useTaskEmbedding.ts` (NEW)

```typescript
import { useCallback } from 'react';
import { trpc } from '../../lib/trpc';
import { useCollections } from '../contexts/CollectionsProvider';

/**
 * Hook to compute and update task embeddings asynchronously
 */
export function useTaskEmbedding() {
  const collections = useCollections();
  const computeEmbedding = trpc.embeddings.compute.useMutation();

  /**
   * Fire-and-forget: Compute embedding and update task
   * Returns immediately, embedding updates in background
   */
  const updateTaskEmbedding = useCallback((
    taskId: string,
    title: string,
    description: string | null,
    labels: string[] = []
  ) => {
    // Combine title, description, and labels
    const parts = [title, description, ...labels].filter(Boolean);
    const text = parts.join(' ');

    // Fire and forget - don't await
    computeEmbedding.mutateAsync({ text })
      .then(({ embedding }) => {
        collections.tasks.update(taskId, (draft) => {
          draft.embedding = embedding;
        });
      })
      .catch(error => {
        console.error('[useTaskEmbedding] Failed to compute embedding:', error);
      });
  }, [collections, computeEmbedding]);

  return { updateTaskEmbedding };
}
```

#### Step 4.2: Update Task Creation Pattern
**File**: `apps/desktop/src/renderer/screens/main/components/TasksView/hooks/useCreateTask.ts` (NEW or UPDATE if exists)

```typescript
import { useCollections } from '../../../contexts/CollectionsProvider';
import { useTaskEmbedding } from '../../../../hooks/useTaskEmbedding';

export function useCreateTask() {
  const collections = useCollections();
  const { updateTaskEmbedding } = useTaskEmbedding();

  const createTask = (taskData: { title: string; description: string | null; /* ... */ }) => {
    // 1. Optimistic insert - immediate UI feedback
    const taskId = crypto.randomUUID();
    collections.tasks.insert({
      id: taskId,
      ...taskData,
      embedding: null, // No embedding yet
    });

    // 2. Fire-and-forget embedding computation
    updateTaskEmbedding(taskId, taskData.title, taskData.description);

    // 3. Return immediately
    return taskId;
  };

  return { createTask };
}
```

**Pattern for updates**: Similar approach - update fields immediately, recompute embedding async.

---

### Phase 5: Desktop Renderer - Semantic Search

**Goal**: Replace substring search with semantic search using embeddings

#### Step 5.1: Create Cosine Similarity Utility
**File**: `apps/desktop/src/renderer/utils/embeddings.ts` (NEW)

```typescript
/**
 * Compute cosine similarity between two embedding vectors
 * Returns value between -1 and 1 (higher = more similar)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}
```

#### Step 5.2: Create Semantic Search Hook with Caching & Hybrid Search
**File**: `apps/desktop/src/renderer/hooks/useSemanticSearch.ts` (NEW)

```typescript
import { useState, useCallback, useRef } from 'react';
import { trpc } from '../lib/trpc';
import { cosineSimilarity } from '../utils/embeddings';

interface Task {
  id: string;
  title: string;
  slug: string;
  embedding?: number[] | null;
}

interface SearchResult<T extends Task> {
  task: T;
  score: number;
}

/**
 * Simple keyword matching score (0-1)
 * Used for hybrid search to catch exact matches
 */
function keywordScore(query: string, task: Task): number {
  const lowerQuery = query.toLowerCase();
  const titleMatch = task.title.toLowerCase().includes(lowerQuery);
  const slugMatch = task.slug.toLowerCase().includes(lowerQuery);

  // Exact slug match = highest score
  if (task.slug.toLowerCase() === lowerQuery) return 1.0;
  // Slug contains = high score
  if (slugMatch) return 0.8;
  // Title contains = medium score
  if (titleMatch) return 0.6;
  // No match
  return 0;
}

/**
 * Hook for hybrid semantic + keyword search with query caching
 */
export function useSemanticSearch<T extends Task>() {
  const [isSearching, setIsSearching] = useState(false);
  const computeEmbedding = trpc.embeddings.compute.useMutation();

  // Cache query embeddings to avoid recomputing
  const queryCache = useRef(new Map<string, number[]>());

  /**
   * Perform hybrid search (semantic + keyword)
   * Returns tasks sorted by relevance (highest score first)
   */
  const search = useCallback(async (
    query: string,
    tasks: T[]
  ): Promise<SearchResult<T>[]> => {
    if (!query.trim()) {
      return tasks.map(task => ({ task, score: 1 }));
    }

    setIsSearching(true);

    try {
      // 1. Get query embedding (from cache or generate)
      let queryEmbedding = queryCache.current.get(query);

      if (!queryEmbedding) {
        const result = await computeEmbedding.mutateAsync({ text: query });
        queryEmbedding = result.embedding;
        queryCache.current.set(query, queryEmbedding);

        // Limit cache size to 50 queries
        if (queryCache.current.size > 50) {
          const firstKey = queryCache.current.keys().next().value;
          queryCache.current.delete(firstKey);
        }
      }

      // 2. Compute hybrid scores (70% semantic + 30% keyword)
      const results = tasks
        .filter(task => task.embedding && task.embedding.length > 0)
        .map(task => {
          const semanticScore = cosineSimilarity(queryEmbedding!, task.embedding!);
          const kwScore = keywordScore(query, task);

          // Hybrid: 70% semantic, 30% keyword
          const hybridScore = (0.7 * semanticScore) + (0.3 * kwScore);

          return { task, score: hybridScore };
        })
        .sort((a, b) => b.score - a.score);

      return results;
    } catch (error) {
      console.error('[useSemanticSearch] Search failed:', error);

      // Fallback to keyword-only search
      return tasks
        .map(task => ({ task, score: keywordScore(query, task) }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score);
    } finally {
      setIsSearching(false);
    }
  }, [computeEmbedding]);

  return { search, isSearching };
}
```

#### Step 5.3: Update useTasksTable to Use Semantic Search
**File**: `apps/desktop/src/renderer/screens/main/components/TasksView/hooks/useTasksTable/useTasksTable.tsx`

Replace globalFilter with semantic search:

```typescript
import { useSemanticSearch } from '../../../../../hooks/useSemanticSearch';

export function useTasksTable({ filterTab, searchQuery }: UseTasksTableParams) {
  // ... existing code

  const { search, isSearching } = useSemanticSearch();
  const [searchResults, setSearchResults] = useState<Map<string, number>>(new Map());

  // Debounced semantic search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(new Map());
      return;
    }

    const timer = setTimeout(async () => {
      const results = await search(searchQuery, data);
      const scoreMap = new Map(
        results.map(r => [r.task.id, r.score])
      );
      setSearchResults(scoreMap);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery, data, search]);

  // Sort by semantic relevance when searching
  const sortedData = useMemo(() => {
    if (searchResults.size === 0) {
      return data;
    }

    // Filter by minimum similarity threshold + sort by score
    return [...data]
      .filter(task => {
        const score = searchResults.get(task.id);
        return score !== undefined && score > 0.3; // 30% similarity threshold
      })
      .sort((a, b) => {
        const scoreA = searchResults.get(a.id) || 0;
        const scoreB = searchResults.get(b.id) || 0;
        return scoreB - scoreA;
      });
  }, [data, searchResults]);

  // Use sortedData for table instead of data
  const table = useReactTable({
    data: sortedData, // Changed from 'data'
    columns,
    // ... rest of config
    // REMOVE: globalFilter, globalFilterFn (no longer needed)
  });

  return { table, isLoading: isLoading || isSearching, slugColumnWidth };
}
```

#### Step 5.4: Add Search Feedback UI
**File**: `apps/desktop/src/renderer/screens/main/components/TasksView/components/TasksTopBar/TasksTopBar.tsx`

Add loading indicator:
```typescript
interface TasksTopBarProps {
  // ... existing
  isSearching?: boolean; // NEW
}

export function TasksTopBar({
  currentTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  isSearching = false // NEW
}: TasksTopBarProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 h-11">
      {/* ... tabs */}

      <div className="relative w-64">
        <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 pl-9 pr-3 text-sm bg-muted/50 border-0 focus-visible:ring-1"
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Critical Files Summary

### New Files to Create:

**API:**
1. `apps/api/src/app/api/integrations/linear/jobs/initial-sync/utils/embeddings.ts` - Server-side embedding generation

**Desktop Main:**
2. `apps/desktop/src/main/lib/embeddings.ts` - Main process embedding model
3. `apps/desktop/src/lib/trpc/routers/embeddings/index.ts` - tRPC router for embeddings

**Desktop Renderer:**
4. `apps/desktop/src/renderer/hooks/useTaskEmbedding.ts` - Fire-and-forget embedding updates
5. `apps/desktop/src/renderer/hooks/useSemanticSearch.ts` - Semantic search hook
6. `apps/desktop/src/renderer/hooks/useCreateTask.ts` - Task creation with embeddings
7. `apps/desktop/src/renderer/utils/embeddings.ts` - Cosine similarity utility

### Files to Modify:

**Database:**
1. `packages/db/src/schema/schema.ts` - Add embedding column

**API:**
2. `apps/api/src/app/api/integrations/linear/jobs/initial-sync/utils.ts` - Update mapIssueToTask signature
3. `apps/api/src/app/api/integrations/linear/jobs/initial-sync/route.ts` - Generate embeddings during sync

**Desktop Main:**
4. `apps/desktop/src/main/index.ts` - Load embedding model on startup
5. `apps/desktop/src/lib/trpc/index.ts` - Register embeddings router

**Desktop Renderer:**
6. `apps/desktop/src/renderer/screens/main/components/TasksView/hooks/useTasksTable/useTasksTable.tsx` - Replace globalFilter with semantic search
7. `apps/desktop/src/renderer/screens/main/components/TasksView/components/TasksTopBar/TasksTopBar.tsx` - Add search loading indicator
8. `apps/desktop/src/renderer/screens/main/components/TasksView/TasksView.tsx` - Pass isSearching prop

---

## Testing & Verification Plan

### 1. Schema Verification
```sql
-- Verify embedding column exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tasks' AND column_name = 'embedding';

-- Should return: embedding | jsonb
```

### 2. API Embedding Generation
```bash
# Trigger Linear sync
# Check database for embeddings

SELECT
  slug,
  title,
  jsonb_array_length(embedding) as embedding_dimensions
FROM tasks
WHERE external_provider = 'linear'
LIMIT 5;

# Should return ~384 dimensions for all tasks
```

### 3. Desktop Model Loading
```bash
# Start desktop app, check logs
# Should see: "[embeddings] Loading model: Xenova/all-MiniLM-L6-v2"
# Should see: "[embeddings] Model loaded and cached"

# First load: ~5-10 seconds (downloads model)
# Subsequent loads: <1 second (uses cache)
```

### 4. Task Creation with Embeddings
```javascript
// Create a test task in desktop app
// Check TanStack DB:
// 1. Task appears immediately (embedding: null)
// 2. After ~200-500ms, embedding populates
// 3. Verify embedding has 384 dimensions
```

### 5. Semantic Search Testing

**Test queries:**
- "authentication bug" → should match tasks with "login", "auth", "user access"
- "performance issue" → should match "slow", "latency", "optimization"
- "database migration" → should match "schema", "SQL", "data"

**Expected behavior:**
- Search triggers in 300ms (debounce)
- Spinner shows while generating query embedding
- Results sorted by relevance
- Tasks with similarity < 0.3 filtered out

### 6. Edge Cases

**No embeddings:**
- Create task → immediately search before embedding computed
- Should gracefully exclude from results

**Empty search:**
- Clear search box → should show all tasks
- No API calls made

**Offline:**
- Disconnect network → create task
- Embedding computation should fail gracefully
- Task still usable, just not semantically searchable

**Model load failure:**
- Simulate model download failure
- Should log error, app should still function
- Search falls back to showing all tasks

---

## Performance Considerations

### Model Size
- **all-MiniLM-L6-v2**: ~90MB download (one-time)
- Cached in: `~/.cache/huggingface/` (or OS equivalent)
- Memory footprint: ~200-300MB when loaded

### Embedding Generation
- **Single task**: ~50-200ms
- **Batch (100 tasks)**: ~2-5 seconds (parallel processing)
- **Search query**: ~50-200ms

### Cosine Similarity
- **100 tasks**: <5ms (pure JavaScript math)
- **1000 tasks**: <50ms
- Scales linearly, no DB queries

### Network Impact
- **Initial model download**: ~90MB (one-time)
- **After cache**: 0 bytes (fully local)
- **Search**: 0 bytes (no API calls)

---

## Dependencies

### New Dependencies

**API:**
```json
{
  "@xenova/transformers": "^2.17.1"
}
```

**Desktop:**
```json
{
  "@xenova/transformers": "^2.17.1"
}
```

**No other dependencies needed** - uses existing:
- tRPC (already set up)
- Electric SQL (already syncing)
- TanStack Table (already used for display)

---

## Rollout Strategy

### Phase 1: Server-Side Only (Low Risk)
1. Deploy schema change (add embedding column)
2. Deploy API with embedding generation
3. Re-sync Linear tasks
4. Verify embeddings in database

### Phase 2: Desktop Read-Only (Testing)
1. Deploy desktop with model loading + tRPC endpoint
2. Test embedding generation for queries
3. Don't wire up to UI yet
4. Monitor performance, model load times

### Phase 3: Full Rollout
1. Wire up semantic search in UI
2. Monitor search quality
3. Collect feedback
4. Tune similarity threshold if needed

### Rollback Plan
- Embedding column nullable → can remove feature without breaking
- Old globalFilter code still exists → revert UI changes
- Model doesn't auto-load → disable via feature flag

---

## Future Enhancements

### Short Term
- [ ] Hybrid search: Combine semantic + keyword matching
- [ ] Search result highlighting
- [ ] Show similarity scores in UI (debugging)
- [ ] Tune similarity threshold (currently 0.3)

### Medium Term
- [ ] Multi-field search weights (title > description)
- [ ] Batch re-embedding on model version changes
- [ ] Background job: Fill missing embeddings
- [ ] Search analytics (track query quality)

### Long Term
- [ ] Upgrade to larger model (better quality, slower)
- [ ] Custom fine-tuned model for task domain
- [ ] Search across comments, attachments
- [ ] Semantic suggestions ("Similar tasks")

---

## Open Questions

None - architecture is fully specified and ready for implementation.
