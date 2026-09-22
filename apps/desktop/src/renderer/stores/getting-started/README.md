Pro onboarding stores a fixed-size, machine-local UI singleton: a bounded bit mask
and two booleans for dismissal and first completion. Only the mobile bit is used, set when the user explicitly
confirms signing in on their phone. Remote access and automation completion come
from their live queries. No account, workspace, or entity IDs are stored.

The key is `pro-getting-started-v1`; persist version 1 clears the earlier
session-launch progress. Dismissing keeps mobile confirmation; Help restores the card.
Completing all available steps dismisses the card once. Changing settings or launching
additional steps later does not reopen it. Help can reopen it without auto-dismissal.
When removing the feature, remove the registry entry and add the key to DEAD_KEYS.
