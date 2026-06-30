# Terminal Pane Lifecycle: VS Code Architecture and Superset Mapping

## Decision

If we want terminal panes to feel durable, workbench-native, and persistence-friendly, the model to follow is VS Code's:

- visible/invisible is a UI state
- attach/detach is a DOM state
- terminal instance lifetime is longer than view lifetime
- close/dispose is the destructive boundary

Our current v2 implementation does not do that yet.

---

## Exact VS Code Architecture

VS Code's terminal UI is split across three layers:

1. `TerminalGroupService`
2. `TerminalGroup`
3. `TerminalInstance`

That split is the key design decision.

## 1. `TerminalGroupService`

Owns:

- the list of terminal groups
- the active group index
- visibility updates when the terminal view or active group changes

What it does:

- asks whether the terminal view is visible
- marks only the active group as visible
- leaves all other groups alive but hidden

Reference:

- `src/vs/workbench/contrib/terminal/browser/terminalGroupService.ts:512`

Simplified from source:

```ts
updateVisibility() {
  const visible = this._viewsService.isViewVisible(TERMINAL_VIEW_ID);
  this.groups.forEach((g, i) => g.setVisible(visible && i === this.activeGroupIndex));
}
```

Meaning:

- tab/group switching does not destroy groups
- visibility is pushed downward as state

## 2. `TerminalGroup`

Owns:

- the DOM container for a terminal group
- the split pane container for terminals inside that group
- the set of `TerminalInstance`s in the group

What it does:

- attaches the group root element to a container
- creates split layout once
- hides the whole group with `display: none`
- forwards visibility changes to each terminal instance

References:

- `src/vs/workbench/contrib/terminal/browser/terminalGroup.ts:470`
- `src/vs/workbench/contrib/terminal/browser/terminalGroup.ts:518`

Simplified from source:

```ts
attachToElement(element: HTMLElement): void {
  this._container = element;

  if (!this._groupElement) {
    this._groupElement = document.createElement("div");
    this._groupElement.classList.add("terminal-group");
  }

  this._container.appendChild(this._groupElement);

  if (!this._splitPaneContainer) {
    this._splitPaneContainer = createSplitPaneContainer(this._groupElement);
    this.terminalInstances.forEach(instance => this._splitPaneContainer!.split(instance));
  }
}

setVisible(visible: boolean): void {
  this._visible = visible;
  if (this._groupElement) {
    this._groupElement.style.display = visible ? "" : "none";
  }
  this.terminalInstances.forEach(i => i.setVisible(visible));
}
```

Meaning:

- a group is hidden, not destroyed
- `display: none` is applied at the group layer
- each instance still exists and receives visibility updates

## 3. `TerminalInstance`

Owns:

- the terminal wrapper DOM element
- the `xterm` instance
- the terminal process manager
- layout and resize behavior
- attach/detach to DOM containers

This is the core lifecycle object.

### 3a. Attach / Detach

References:

- `src/vs/workbench/contrib/terminal/browser/terminalInstance.ts:1028`

Simplified from source:

```ts
detachFromElement(): void {
  this._wrapperElement.remove();
  this._container = undefined;
}

attachToElement(container: HTMLElement): void {
  if (this._container === container) {
    return;
  }

  this._container = container;
  this._container.appendChild(this._wrapperElement);

  if (this.xterm?.raw.element) {
    this.xterm.raw.open(this.xterm.raw.element);
  }

  this.xterm?.refresh();
}
```

Meaning:

- detach is DOM removal, not disposal
- attach reparents the wrapper
- an existing `xterm` can be refreshed and reused

### 3b. Visibility

References:

- `src/vs/workbench/contrib/terminal/browser/terminalInstance.ts:1393`

Simplified from source:

```ts
setVisible(visible: boolean): void {
  const didChange = this._isVisible !== visible;
  this._isVisible = visible;
  this._wrapperElement.classList.toggle("active", visible);

  if (visible && this.xterm) {
    this._open();
    this._resizeDebouncer?.flush();
    this._resize();
  }

  if (didChange) {
    this._onDidChangeVisibility.fire(visible);
  }
}
```

Meaning:

- visibility is tracked explicitly
- becoming visible triggers open/resize/refresh work
- invisible is not equivalent to dispose

### 3c. Lazy Open

References:

- `src/vs/workbench/contrib/terminal/browser/terminalInstance.ts:1067`

Simplified from source:

```ts
private _open(): void {
  if (!this.xterm || this.xterm.raw.element) {
    return;
  }

  if (!this._container || !this._container.isConnected) {
    throw new Error("container must be attached before open");
  }

  const xtermHost = document.createElement("div");
  this._wrapperElement.appendChild(xtermHost);
  this._container.appendChild(this._wrapperElement);

  xterm.attachToElement(xtermHost);
}
```

Meaning:

- `xterm` open is lazy
- VS Code does not assume terminal DOM must always be live
- it waits until the instance is visible and attached

### 3d. Layout Guarding

References:

- `src/vs/workbench/contrib/terminal/browser/terminalInstance.ts:1942`
- `src/vs/workbench/contrib/terminal/browser/terminalInstance.ts:1983`

Simplified from source:

```ts
layout(dimension: Dimension): void {
  if (dimension.width <= 0 || dimension.height <= 0) {
    return;
  }

  this._evaluateColsAndRows(dimension.width, dimension.height);
  this._resize();
}

private async _resize(): Promise<void> {
  if (!this.xterm) {
    return;
  }

  if (this._isVisible && this._layoutSettingsChanged) {
    applyFontSettings();
    this._initDimensions();
  }
}
```

Meaning:

- hidden containers are not measured
- layout is skipped when size is invalid
- expensive measurement work happens only while visible

---

## The Actual Lifecycle VS Code Uses

This is the important part.

### Switch away from a terminal group

1. `TerminalGroupService.updateVisibility()` marks only the active group visible.
2. The old group gets `setVisible(false)`.
3. The group root is hidden.
4. Each `TerminalInstance` gets `setVisible(false)`.
5. No dispose happens.
6. No process teardown happens.

### Show a terminal group again

1. `TerminalGroupService.updateVisibility()` makes the target group visible.
2. `TerminalGroup.setVisible(true)` unhides the group root.
3. Each `TerminalInstance.setVisible(true)` runs.
4. The instance lazily opens if needed, flushes resizes, and recomputes terminal size.

### Move or reparent a terminal

1. `TerminalInstance.detachFromElement()` removes the wrapper from old DOM.
2. `TerminalInstance.attachToElement(newContainer)` reparents it.
3. Existing `xterm` is refreshed instead of recreated.

### Close a terminal

This is the destructive boundary:

- dispose the terminal instance
- tear down process/session state

That is not what ordinary invisibility does.

---

## Mapping To Superset

## What our current v2 code does

### `packages/panes`

`Workspace.tsx` renders only the active tab.

Reference:

- `packages/panes/src/react/components/Workspace/Workspace.tsx`

Meaning:

- inactive tabs are removed from the React tree
- their panes are unmounted

### Current v2 `TerminalPane`

`TerminalPane.tsx` creates a fresh `XTerm` in `useEffect` and destroys it in cleanup.

Reference:

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx`

Current shape:

```ts
useEffect(() => {
  const terminal = new XTerm(...);
  const socket = new WebSocket(...);

  return () => {
    socket.close();
    terminal.dispose();
  };
}, [websocketUrl]);
```

Meaning:

- active tab change -> unmount
- unmount -> transport close
- unmount -> `xterm.dispose()`

So our current v2 lifecycle is:

- inactive == destroyed view

not:

- inactive == hidden or detached view

## What our older desktop terminal already did

Our older terminal stack was much closer to VS Code:

- unmount usually scheduled `detach`
- explicit pane destruction killed the session
- StrictMode churn was handled explicitly

References:

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/state.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalLifecycle.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/attach-scheduler.ts`

Most important difference:

- old stack: unmount usually meant detach
- current v2 stack: unmount means dispose

---

## Exact Gap Between VS Code and Us

| Concern | VS Code | Superset v2 today |
| --- | --- | --- |
| Active tab switch | hide group | unmount pane |
| Terminal view lifetime | longer than DOM lifetime | tied to React effect |
| `xterm` lifetime | preserved | recreated |
| DOM move/reattach | explicit attach/detach API | none |
| Hidden layout handling | guarded, refresh on reveal | not applicable because view is destroyed |
| Destructive boundary | close/dispose only | ordinary inactivity currently destroys view state |

---

## What We Should Copy From VS Code

We do not need to copy every class, but we should copy these exact ideas:

## 1. Make visibility explicit

Have a terminal runtime/view layer that can receive:

```ts
setVisible(paneId, visible)
```

instead of using React unmount as the visibility signal.

## 2. Add attach/detach

Introduce:

```ts
attach(paneId, hostElement)
detach(paneId)
dispose(paneId)
```

with these semantics:

- `attach` = connect an existing terminal view to a DOM host
- `detach` = remove from DOM, keep terminal alive
- `dispose` = final teardown

## 3. Keep terminal lifetime outside React

The React component should own:

- host element
- focus state
- visible state

The terminal runtime should own:

- session transport
- `xterm`
- addon lifecycle
- detach/dispose decisions

## 4. Treat close as the destructive boundary

We should align behavior to:

- tab switch -> detach or hide
- pane collapse -> detach or hide
- pane close -> dispose + close session

---

## Minimal Superset Target

If we want the smallest useful change, the target is:

1. keep rendering only the active tab if we want
2. but do not let tab switch destroy terminal state
3. move terminal ownership into a registry
4. on unmount, call `detach`, not `dispose`
5. on explicit close, call `dispose`

That gets us the important property VS Code has:

- view lifetime and terminal lifetime are not the same thing

---

## Reference Files

### Superset

- `packages/panes/src/react/components/Workspace/Workspace.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/TerminalPane/TerminalPane.tsx`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/state.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/hooks/useTerminalLifecycle.ts`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/attach-scheduler.ts`

### VS Code

- `https://github.com/microsoft/vscode/blob/fd640bbea7c7f25452a158765b1d3c2f4f05d6f4/src/vs/workbench/contrib/terminal/browser/terminalGroupService.ts`
- `https://github.com/microsoft/vscode/blob/fd640bbea7c7f25452a158765b1d3c2f4f05d6f4/src/vs/workbench/contrib/terminal/browser/terminalGroup.ts`
- `https://github.com/microsoft/vscode/blob/fd640bbea7c7f25452a158765b1d3c2f4f05d6f4/src/vs/workbench/contrib/terminal/browser/terminalInstance.ts`
