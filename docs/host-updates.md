# Standalone host updates

Start a standalone host with automatic updates enabled:

```sh
superset start --daemon --auto-update
```

The first check runs after one hour and repeats hourly. Newer releases from the
CLI release channel are installed automatically, then the host restarts using
its existing health check and rollback flow. Terminal connections reconnect
during the restart. Desktop-bundled hosts continue to update with the desktop.

Automatic updates are off by default. Stop and restart the host to change this
option; passing a flag to `start` while it is already running does not change the
running process. Start without `--auto-update` (or with `--no-auto-update`) to
turn it off. Service managers launching `superset-host` directly can set
`SUPERSET_HOST_AUTO_UPDATE=true`; the setting survives update and rollback
restarts. It is not a persisted CLI config preference, so include it on each
new launch.

Checks never downgrade the running host. Network failures retry on the next
hourly check. A release that failed restart health checks is skipped on future
automatic checks, including after rollback; a manual update can retry it.

## Permission denied on `superset.update-lock`

Both the host's `SelfUpdater.start()` and `superset update` use
`packages/shared/src/install-update-lock.ts`. For an install at
`/opt/kinro/superset`, the exclusive lock is `/opt/kinro/superset.update-lock`.
It stays outside the install because the update replaces the install directory.
The CLI child borrows its parent host's lock, and all organizations sharing an
install must use the same lock.

`EACCES` can mean the host user cannot search or write `/opt/kinro`, for example
when root installed Superset but an unprivileged service runs the host. An
existing lock owned by another user can also prevent access. On the machine
used to investigate this report, `/opt` was `root:wheel` with mode `0755`, but
`/opt/kinro` did not exist; the reporter's exact permissions remain unverified.

The updater now checks parent-directory access and reports the install path,
lock path, host UID, and recovery guidance for permission and read-only errors.
Moving the lock to a user state directory would not fix this: staging the
archive, renaming the install, and keeping/restoring a backup all require access
to the install's parent directory too.

On the affected host, inspect the service's user and filesystem ownership:

```sh
id
ls -ld /opt /opt/kinro /opt/kinro/superset
ls -l /opt/kinro/superset.update-lock
```

Have an administrator grant the actual host service user ownership/access to
its dedicated install parent and install tree, including old staging/backup
files, or reinstall as that user under `~/superset` and update the service's
launch path. Do not change ownership of `/opt` or make it world-writable. Inspect
an existing lock's PID and remove it only after confirming its update process
has exited. The updater does not elevate privileges or change ownership.
