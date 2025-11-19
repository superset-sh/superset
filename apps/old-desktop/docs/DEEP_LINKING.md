# Deep Linking in Superset Desktop

This guide explains how deep linking works in the Superset desktop app and how to use it.

## Overview

Deep linking allows you to open the Superset desktop app from a website or external application using custom URLs with the `superset://` protocol scheme.

## How It Works

### Protocol Registration

The app registers the `superset://` protocol scheme during startup:

- **macOS**: Uses `app.setAsDefaultProtocolClient()` to register the protocol handler
- **Windows/Linux**: Same registration mechanism, OS handles the protocol

### Development vs Production

In **development mode**, the protocol handler includes the executable path and arguments:

```typescript
app.setAsDefaultProtocolClient('superset', process.execPath, [path.resolve(process.argv[1])]);
```

In **production mode**, it's simpler:

```typescript
app.setAsDefaultProtocolClient('superset');
```

### URL Handling Flow

1. **Website/external app** triggers a deep link: `superset://action/something`
2. **OS** routes the URL to the Superset desktop app
3. **Main process** receives the URL via:
   - `open-url` event (macOS) - app already running
   - Command line args (Windows/Linux) - app launch
4. **Deep link manager** stores the URL
5. **Renderer process** polls for the URL via IPC
6. **Your handler** receives and processes the URL

## Using Deep Links

### From a Website

```html
<!-- Simple link -->
<a href="superset://workspace/my-workspace-id">Open Workspace</a>

<!-- JavaScript -->
<button onclick="window.location.href='superset://workspace/my-workspace-id'">
  Launch App
</button>
```

### In the Renderer Process

Use the `useDeepLink` hook to handle deep links in your React components:

```tsx
import { useDeepLink } from '@/renderer/hooks/useDeepLink';

function MyComponent() {
  useDeepLink((url) => {
    console.log('Deep link received:', url);

    // Parse the URL
    const urlObj = new URL(url);

    // Handle different deep link types
    if (urlObj.hostname === 'workspace') {
      const workspaceId = urlObj.pathname.slice(1);
      // Load the workspace...
    } else if (urlObj.hostname === 'worktree') {
      // Handle worktree deep link...
    }
  });

  return <div>My Component</div>;
}
```

### URL Format Examples

```
superset://workspace/abc123              # Open workspace by ID
superset://worktree/abc123/def456        # Open workspace + worktree
superset://action/create-workspace       # Trigger an action
superset://import?url=https://...        # Import with query params
```

## Implementation Details

### Files

- **Main process**: `apps/desktop/src/main/index.ts` - Protocol registration
- **Deep link manager**: `apps/desktop/src/main/lib/deep-link-manager.ts` - URL storage
- **IPC handlers**: `apps/desktop/src/main/lib/deep-link-ipcs.ts` - IPC communication
- **IPC types**: `apps/desktop/src/shared/ipc-channels.ts` - Type definitions
- **React hook**: `apps/desktop/src/renderer/hooks/useDeepLink.ts` - Renderer API

### IPC Channel

The deep link system uses a single IPC channel:

```typescript
"deep-link-get-url": {
  request: void;
  response: string | null;
}
```

Calling this channel returns and clears the current deep link URL (one-time retrieval).

### Development Workflow

1. Start the dev server: `bun dev`
2. In your browser/terminal, trigger a deep link: `open superset://test/hello`
3. The app should receive and log the URL

### Fallback Handling

When using deep links from a website, consider that users might not have the app installed:

```javascript
function openApp() {
  const deepLink = 'superset://workspace/abc123';
  const timeout = setTimeout(() => {
    // App didn't open, redirect to download page
    window.location.href = '/download';
  }, 2000);

  window.addEventListener('blur', () => {
    // App likely opened
    clearTimeout(timeout);
  });

  window.location.href = deepLink;
}
```

## Testing

### macOS

```bash
# Open a deep link from terminal
open superset://test/hello

# Or use a direct protocol handler
open -a Superset superset://workspace/abc123
```

### Windows

```powershell
# Run from PowerShell
start superset://test/hello
```

### Linux

```bash
# Run from terminal
xdg-open superset://test/hello
```

## Security Considerations

- Always validate and sanitize deep link URLs before processing
- Never execute arbitrary code from deep link parameters
- Treat deep link data as untrusted user input
- Validate workspace/worktree IDs exist before navigation

## Troubleshooting

**Deep links not working in development:**
- Make sure the app is running (`bun dev`)
- Check console logs for protocol registration messages
- On macOS, try `open superset://test` to verify protocol is registered

**URL not being received in renderer:**
- Check the polling interval in `useDeepLink` hook
- Verify IPC handler is registered in `main/windows/main.ts`
- Check browser console for errors

**Multiple instances opening:**
- This is expected behavior - the app allows multiple instances
- Each instance will independently handle deep links
