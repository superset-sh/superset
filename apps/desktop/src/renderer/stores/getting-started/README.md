Getting-started progress is a fixed-size, machine-local UI singleton: a four-bit
mask and a dismissal boolean. It contains no account, workspace, or entity IDs.
A bit means the introductory session was created, not that the agent completed
the workflow. Dismissing keeps progress; Help → Getting started restores the card.

The key is `getting-started-v1`. When removing this feature, remove its registry
entry and add the key to `DEAD_KEYS` so the renderer boot sweep deletes it.
