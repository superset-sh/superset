# VS Code Terminal Restore And Layout Pattern

This note captures the specific part of VS Code we should copy when restoring a terminal from serialized state.

## Core Rule

Serialization restores terminal buffer state.

It does not solve layout by itself.

VS Code treats these as separate steps:

- attach the existing terminal instance to a container
- wait until the terminal is visible
- measure real dimensions
- resize xterm and the backend process

The practical lesson is:

- restore buffer first
- restore geometry only after visible attach

## What VS Code Does

Source: `src/vs/workbench/contrib/terminal/browser/terminalInstance.ts`

### 1. Reattach the terminal instance

VS Code keeps a terminal instance alive and moves its wrapper between containers.

Distilled example:

```ts
attachToElement(container: HTMLElement) {
  if (this._container === container) return;

  this._container = container;
  this._container.appendChild(this._wrapperElement);

  if (this.xterm?.raw.element) {
    this.xterm.raw.open(this.xterm.raw.element);
  }

  this.xterm?.refresh();
}
```

Important point:

- reattach does not dispose or recreate the terminal

### 2. Only do real resize work when visible

When a terminal becomes visible, VS Code forces a fresh resize.

Distilled example:

```ts
setVisible(visible: boolean) {
  this._isVisible = visible;
  this._wrapperElement.classList.toggle("active", visible);

  if (visible && this.xterm) {
    this._open();
    this._resizeDebouncer?.flush();
    this._resize();
  }
}
```

Important point:

- becoming visible is the trigger for authoritative geometry refresh

### 3. Skip layout when dimensions are invalid

VS Code refuses to layout when the host is hidden, detached, or zero-sized.

Distilled example:

```ts
layout(dimension: { width: number; height: number }) {
  this._lastLayoutDimensions = dimension;

  if (dimension.width <= 0 || dimension.height <= 0) {
    return;
  }

  const terminalWidth = this._evaluateColsAndRows(
    dimension.width,
    dimension.height,
  );

  if (!terminalWidth) {
    return;
  }

  this._resize();
}
```

Important point:

- do not call `fit()` or measure against `display: none`

### 4. Fall back to last known cols/rows when measurement is not possible

VS Code preserves the last usable grid size and reuses it until real measurement is possible.

Distilled example:

```ts
private _evaluateColsAndRows(width: number, height: number) {
  if (!width || !height) {
    this._setLastKnownColsAndRows();
    return null;
  }

  const dimension = this._getDimension(width, height);
  if (!dimension) {
    this._setLastKnownColsAndRows();
    return null;
  }

  const next = getScaledTerminalDimensions(dimension);
  if (!next) {
    this._setLastKnownColsAndRows();
    return null;
  }

  this._cols = next.cols;
  this._rows = next.rows;
  return dimension.width;
}
```

Important point:

- restore can start with saved or last-known grid dimensions
- final geometry still comes from visible measurement

### 5. Resize xterm and then update the backend process

VS Code treats grid resize as a real runtime event, not just UI state.

Distilled example:

```ts
private async _resize() {
  const cols = this.cols;
  const rows = this.rows;

  if (isNaN(cols) || isNaN(rows)) {
    return;
  }

  this._resizeDebouncer.resize(cols, rows);
}

private async _updatePtyDimensions(xterm: XtermTerminal) {
  await this._processManager.setDimensions(
    xterm.cols,
    xterm.rows,
    undefined,
    roundedPixelWidth,
    roundedPixelHeight,
  );
}
```

Important point:

- restored xterm size and PTY size must converge after attach

## What This Means For Us

If we restore with `SerializeAddon`, the right flow is:

1. Create or reuse the terminal runtime keyed by `paneId`.
2. Initialize xterm with provisional `cols` and `rows` from saved state.
3. Replay `snapshotAnsi` and any mode rehydration.
4. Attach to the host element.
5. If the host is not visible or has zero size, do not fit yet.
6. When visible, run the real fit/measurement pass.
7. Send the resulting resize to the backend session.

## What Not To Do

- do not treat serialized output as enough to restore geometry
- do not call `fit()` during hidden attach
- do not make `workspaceId` part of terminal identity
- do not dispose on ordinary React unmount

## Implementation Shape For v2

`terminalRuntimeRegistry` should eventually mirror this shape:

```ts
attach({ paneId, host, savedSnapshot, savedCols, savedRows }) {
  const runtime = getOrCreateRuntime(paneId, savedCols, savedRows);

  runtime.attachHost(host);
  runtime.restoreSnapshotIfNeeded(savedSnapshot);

  if (hostIsVisible(host)) {
    runtime.measureAndResize();
  }
}
```

```ts
onVisible() {
  this.measureAndResize();
  this.sendResizeToSession();
}
```

```ts
measureAndResize() {
  if (!this.host || this.host.clientWidth <= 0 || this.host.clientHeight <= 0) {
    return;
  }

  this.fitAddon.fit();
  this.sendResize();
}
```

## Relation To v1

This is the part where v1 was closer.

The old desktop terminal already had:

- detach vs kill behavior
- snapshot restore
- mode rehydration
- cold restore after a real restart

So the correct direction is:

- keep the new v2 lifetime split
- copy the old v1 restore semantics
- copy VS Code’s visible-layout discipline
