# [plugins] Add Try now and Copy link to plugin details

## Context

Plugin detail pages should make it easy to try a plugin and share it. Add a prominent Try now action and a secondary Copy link action using the supplied screenshots. Trying a plugin should prepare an example the user can edit before sending it.

## References

| Source | Who | Link | Date |
| --- | --- | --- | --- |
| Product feedback | Avi | [Notion page](https://app.notion.com/p/3eab9d5bf61680b9a6ded9e98069b80a) | 2026-09-29 |
| Design reference | Avi | [Plugin actions](../references/plugin-actions.png), [prefilled composer](../references/plugin-composer.png) | 2026-09-29 |

## Implementation notes

### Files

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/plugins/$pluginName/components/PluginDetail/PluginDetail.tsx:40`: current detail-page header and install/update/enabled controls.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/plugins/hooks/usePluginConnections/usePluginConnections.ts:13`: connection flow to preserve the prepared prompt through setup.

### Approach

Try now opens the chat composer with the plugin selected and a useful example prompt prefilled. Do not send automatically. If installation or connection is needed, complete that flow while preserving the selected plugin and prepared text. Copy link copies a stable plugin detail-page link and shows confirmation. Match the reference's button hierarchy.

### Gotchas

- Verify installed/connected, installed/disconnected, and not-installed states, including cancel/retry and returning from the browser.
- Verify users can edit the prompt and that copying a link succeeds or reports a clear failure.
- Use the existing composer and plugin identity mechanisms; do not introduce another chat surface.
- This draft contains requirements only; the PR pane prototype does not implement these plugin actions.
