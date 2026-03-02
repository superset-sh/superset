# Zustand Stores

This directory contains Zustand stores for React state management in the renderer process.

## Quick Start

```typescript
// 1. Create a store
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface MyState {
  value: string;
  setValue: (value: string) => void;
}

export const useMyStore = create<MyState>()(
  devtools(
    (set) => ({
      value: '',
      setValue: (value) => set({ value }),
    }),
    { name: 'MyStore' }
  )
);

// 2. Use in component
import { useMyStore } from 'renderer/stores';

function MyComponent() {
  const value = useMyStore((state) => state.value);
  const setValue = useMyStore((state) => state.setValue);

  return <input value={value} onChange={(e) => setValue(e.target.value)} />;
}
```

## Best Practices

### 1. TypeScript First
Always define interfaces for your stores:
```typescript
interface UserState {
  user: User | null;
  setUser: (user: User) => void;
  clearUser: () => void;
}
```

### 2. Use Selectors for Performance
Create selector hooks to prevent unnecessary re-renders:
```typescript
// In store file
export const useUser = () => useUserStore((state) => state.user);
export const useUserName = () => useUserStore((state) => state.user?.name);

// In component - only re-renders when name changes
const userName = useUserName();
```

### 3. DevTools Integration
Always use devtools middleware in development:
```typescript
export const useMyStore = create<MyState>()(
  devtools(
    (set) => ({ /* store definition */ }),
    { name: 'MyStore' } // Shows in Redux DevTools
  )
);
```

### 4. Persistence (Optional)
Use persist middleware for localStorage persistence:
```typescript
import { persist } from 'zustand/middleware';

export const useMyStore = create<MyState>()(
  devtools(
    persist(
      (set) => ({ /* store definition */ }),
      { name: 'my-store-key' } // localStorage key
    ),
    { name: 'MyStore' }
  )
);
```

### 5. Organize Actions
Group related actions together:
```typescript
export const useTaskStore = create<TaskState>()(
  devtools((set) => ({
    tasks: [],

    // Add actions
    addTask: (task) => set((state) => ({
      tasks: [...state.tasks, task]
    })),

    // Update actions
    updateTask: (id, updates) => set((state) => ({
      tasks: state.tasks.map(t => t.id === id ? { ...t, ...updates } : t)
    })),

    // Remove actions
    removeTask: (id) => set((state) => ({
      tasks: state.tasks.filter(t => t.id !== id)
    })),

    // Bulk actions
    clearCompleted: () => set((state) => ({
      tasks: state.tasks.filter(t => !t.completed)
    })),
  }))
);
```

### 6. Async Actions
Handle async operations within actions:
```typescript
export const useDataStore = create<DataState>()(
  devtools((set) => ({
    data: null,
    loading: false,
    error: null,

    fetchData: async () => {
      set({ loading: true, error: null });
      try {
        const data = await api.getData();
        set({ data, loading: false });
      } catch (error) {
        set({ error, loading: false });
      }
    },
  }))
);
```

### 7. Slice Pattern for Large Stores
Split large stores into slices:
```typescript
interface UserSlice {
  user: User | null;
  setUser: (user: User) => void;
}

interface SettingsSlice {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

type AppState = UserSlice & SettingsSlice;

const createUserSlice = (set): UserSlice => ({
  user: null,
  setUser: (user) => set({ user }),
});

const createSettingsSlice = (set): SettingsSlice => ({
  theme: 'light',
  setTheme: (theme) => set({ theme }),
});

export const useAppStore = create<AppState>()(
  devtools(
    (...a) => ({
      ...createUserSlice(...a),
      ...createSettingsSlice(...a),
    })
  )
);
```

## When to Use Zustand vs tRPC

- **Zustand**: Local UI state (sidebar open/closed, active tab, theme preferences)
- **tRPC**: Server state and IPC communication with Electron main process
- **Combine them**: Use tRPC queries to fetch data, store UI state in Zustand

## Debugging

1. Install Redux DevTools browser extension
2. Stores with `devtools()` middleware will appear in the extension
3. You can inspect state changes, time-travel, and dispatch actions

## Resources

- [Zustand Documentation](https://zustand.docs.pmnd.rs/)
- [TypeScript Guide](https://zustand.docs.pmnd.rs/guides/typescript)
- [Persisting Store](https://zustand.docs.pmnd.rs/integrations/persisting-store-data)
