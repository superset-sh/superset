# Issue: "Open in Editor" Fails on Linux

**Status:** Fixed  
**Severity:** High  
**Platform:** Linux  
**Component:** `apps/desktop/src/lib/trpc/routers/external/helpers.ts`

---

## Symptom

Attempting to open a file in an external editor from the Superset desktop app on Linux produces the following error:

```
Failed to open: xdg-open: unexpected option '-a'
Try 'xdg-open --help' for more information.
```

This affects all "Open in Editor" flows — terminal file link clicks, sidebar context menu actions, and keyboard shortcut (`⌘O`) triggers.

## Root Cause

The `getAppCommand()` function in `helpers.ts` unconditionally generated macOS-specific commands:

```ts
// For most apps:
{ command: "open", args: ["-a", "Visual Studio Code", targetPath] }

// For multi-edition JetBrains IDEs:
{ command: "open", args: ["-b", "com.jetbrains.intellij", targetPath] }
```

On Linux, `open` is typically aliased or symlinked to `xdg-open`, which does **not** support `-a` (open with application name) or `-b` (open by bundle ID) — these are macOS-only flags. This caused every editor launch to fail with the reported error.

## Fix

Made `getAppCommand()` platform-aware by checking `process.platform`:

### macOS (unchanged)

Uses `open -a <AppName>` and `open -b <bundleId>` as before.

### Linux (new)

Uses direct CLI commands that editors register on the system `$PATH`:

| App | CLI Command |
|:----|:------------|
| VS Code | `code` |
| VS Code Insiders | `code-insiders` |
| Cursor | `cursor` |
| Antigravity | `antigravity` |
| Zed | `zed` |
| Sublime Text | `subl` |
| Ghostty | `ghostty` |
| Warp | `warp-terminal` |
| WebStorm | `webstorm` |
| PhpStorm | `phpstorm` |
| RubyMine | `rubymine` |
| GoLand | `goland` |
| CLion | `clion` |
| Rider | `rider` |
| DataGrip | `datagrip` |
| Fleet | `fleet` |
| RustRover | `rustrover` |
| IntelliJ IDEA | `idea` → `intellij-idea-ultimate` → `intellij-idea-community` |
| PyCharm | `pycharm` → `pycharm-professional` → `pycharm-community` |

Multi-edition JetBrains IDEs (IntelliJ, PyCharm) use a candidate list with fallback, matching the macOS bundle ID pattern.

macOS-only apps (`Xcode`, `iTerm`, `AppCode`) return `null` on Linux, which causes the caller to fall through to Electron's `shell.openPath()` (delegates to `xdg-open` for default system behavior).

## Files Changed

| File | Change |
|:-----|:-------|
| `apps/desktop/src/lib/trpc/routers/external/helpers.ts` | Added Linux CLI mappings, made `getAppCommand()` platform-aware |

## Testing Notes

- No existing tests cover `getAppCommand()` — manual verification required.
- On Linux, verify each supported editor opens correctly when installed.
- On macOS, confirm no regression — behavior is unchanged behind the `darwin` platform check.
- The `openPathInApp()` fallback path (`shell.openPath`) is already cross-platform via Electron and required no changes.
