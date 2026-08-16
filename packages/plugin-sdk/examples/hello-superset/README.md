# hello-superset

Example Superset plugin: a right-sidebar tab with a persistent counter, two
palette commands, a backend action, and a realtime push.

```bash
# build the UI + server bundles (from this directory)
superset plugin build .
bunx esbuild src/server.ts --bundle --format=esm --platform=node --outfile=dist/server.js

# register it in place (dev flow), then reload after edits
superset plugin link .
superset plugin reload superset.hello
```

Open any v2 workspace: the "Hello" tab appears in the right sidebar, and
"Hello Plugin: …" commands appear in the command palette.
