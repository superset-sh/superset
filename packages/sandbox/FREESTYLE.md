# Freestyle cloud workspaces

Freestyle is an optional cloud sandbox provider. Vercel remains the default;
existing environments and clients keep their current behavior. Deploy the updated
API before releasing the CLI option; older APIs do not recognize the provider
input. Select Freestyle
when creating an environment through the CLI:

```sh
superset environments create --name Development --repo owner/repo --provider freestyle
```

Workspaces inherit their environment's provider. The existing host-service,
terminal, files, git operations, desktop, and Superset gate are shared by both
providers. The desktop's environment creation form currently creates Vercel
environments; it can open environments created with the Freestyle CLI option.

## Deployment setup

Deploy Freestyle's exact HTTP request-header matcher before enabling this
provider. Superset's model credential rules require matching the placeholder
header before substituting the real credential. An API that rejects this matcher
fails provisioning before Internet egress is enabled. Credentials remain in TLS
rules; they are never copied into the VM's environment or identity file.

Set `FREESTYLE_API_KEY` on the API deployment, using an account that owns the
prepared snapshot and the forward-auth configuration below. These values are
optional while using only Vercel. Existing Vercel configuration is still required.

Build the bundle into an Ubuntu VM and publish a private snapshot:

```sh
cd packages/sandbox
FREESTYLE_API_KEY=... bun run image:freestyle superset-base-<unique-release>
```

Set the printed `FREESTYLE_SANDBOX_SNAPSHOT_ID` on the API deployment. The builder
uses `freestyle/ubuntu-lg` (8 vCPU, 16 GiB RAM, 64 GB disk), installs the shared apt
manifests and checksum-verified bundle/assets, then cold boots before snapshotting.
`FREESTYLE_BASE_SNAPSHOT_ID` can pin a specific base snapshot. The temporary build
VM is deleted on success or failure; the published snapshot remains.

Deploy the API's `/api/sandbox/freestyle-auth` route, then configure the shared
Freestyle authorization check:

```sh
FREESTYLE_API_KEY=... bun run auth:freestyle https://api.example.com
```

Set the printed `FREESTYLE_SANDBOX_FORWARD_AUTH_ID` on the API deployment. This
configuration belongs to the deployment and is reused across workspaces. The
endpoint validates the Superset host credential against the workspace encoded in
Freestyle's authenticated `x-forwarded-host` metadata. Freestyle runs this check
before waking or forwarding to the VM. Clients continue presenting their tickets
to the Superset gate, which supplies the host credential upstream.

Do not supply `--region` for Freestyle; its public API does not expose placement
selection. The environment reports the logical region `default`.

## Lifecycle and templates

Sleep and archive grace-period stop use Freestyle pause, retaining memory and
files. Wake rotates outbound credential rules, extends the four-hour runtime
budget, resumes the VM, and pushes the managed environment. Restart powers off
and cold boots the VM, then runs the shared boot script again. Paused workspaces
request 30 days of retention; account plan limits still apply.

Replacing an environment requires a workspace on the same provider. A workspace
whose archived VM has already been deleted is recreated using its environment
provider.

Promotion snapshots the source and sanitizes a disposable clone with no Internet
egress. It cold boots the clone, removes Superset identity, logs, checkout markers,
host database, and workspace environment file, and cold boots again before
publishing the template. This clears processes and the old managed environment
from RAM. The source is not stopped or stripped. Temporary VMs and snapshots are
removed. Promoted environment cleanup deletes its snapshot; workspace deletion
removes the VM and its associated firewall/TLS rules. Templates retain the source's
other files, so review them before sharing an environment.

The adapter supports Superset's current Internet catch-all plus one credential
rule per hostname. Other network policy shapes fail explicitly.
