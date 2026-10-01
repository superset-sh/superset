Credential identity and matching logic is adapted from [Orca](https://github.com/stablyai/orca/tree/841503152c/src/main/claude-accounts/runtime-auth), revision `841503152c`, under the adjacent MIT license. The matching algorithm is unchanged; storage and host routing use Superset adapters.

`runtime.test.ts` adapts the outgoing-refresh, unverified-readback, matching-account, stale-readback, ambiguity, and organization-conflict cases from Orca's `runtime-auth-service-account-switching.test.ts`. `storage.test.ts` covers Superset's filesystem and Keychain adapter, rollback, permissions, and system-default selection.

Superset keeps saved profiles separate from a stable `$SUPERSET_HOME_DIR/state/claude-runtime` directory. Switching updates that runtime's credentials and OAuth identity. It does not refresh OAuth tokens itself. The host serializes switches across organization processes with a filesystem lock. Existing profile-based sessions need one resume into the shared runtime; later subscription switches keep that runtime path stable. Explicit user-selected config directories remain outside this flow.

The Usage host picker selects accounts already signed in on the target host. Credentials are not transferred between machines. Tests use synthetic credentials; live Claude and remote-host end-to-end verification is still required.
