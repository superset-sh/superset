# Client state

`@superset/client-state` owns preferences that belong to a signed-in client,
not to a resource host. The first consumer is the dashboard sidebar layout.

## Ownership

- Resource hosts own projects, workspaces, agents, terminals, and files.
- Client state owns project/group ordering, collapse state, workspace placement,
  and hidden sidebar records.
- State is scoped by organization and user. Separate devices have separate
  `SUPERSET_HOME_DIR` trees, so two clients connected to the same host do not
  share layout accidentally.

The persisted path is:

```text
<SUPERSET_HOME_DIR>/client-state/<organizationId>/<userId>/sidebar.json
```

The CLI uses the file store directly. Electron main exposes the same store to
the renderer through its existing IPC tRPC boundary and watches atomic file
renames for CLI changes. No renderer or resource-host round trip is required
for a CLI write.

## Compatibility and concurrency

Writes use a short-lived lock plus temporary-file rename. Commands are applied
inside the lock, while renderer snapshot replacements use a revision check so
a stale window cannot overwrite a newer CLI command.

Existing renderer localStorage is migrated on the first Electron connection.
If the CLI writes first while Electron is closed, the file remains marked as
pending migration; Electron merges its existing local state with those CLI
changes before making the file canonical. Pane layouts remain in their existing
workspace-local records and are never serialized into this store.
