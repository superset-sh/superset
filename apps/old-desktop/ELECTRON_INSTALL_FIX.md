# fixing electron installation issues

## problem

when running `bun run dev`, you might encounter this error:

```
error during start dev server and electron app:
Error: Electron uninstall
```

this happens because electron's binary didn't download properly during installation. bun has a known issue where electron's postinstall script doesn't always run correctly.

## quick fix

run the electron install script manually:

```bash
node /Users/aleks/Documents/GitHub/Kitenite/superset/node_modules/.bun/electron@*/node_modules/electron/install.js
```

replace the `*` with your actual electron version if needed, or just use the glob pattern - your shell should expand it.

## verification

check if the electron binary was downloaded:

```bash
ls -la /Users/aleks/Documents/GitHub/Kitenite/superset/node_modules/.bun/electron@*/node_modules/electron/
```

you should see a `dist/` directory. if it's there, electron is properly installed.

## why this happens

1. bun installs electron package
2. electron's postinstall script should download the binary
3. with bun, this script sometimes doesn't execute
4. the package exists but the actual electron binary is missing
5. electron-vite fails when trying to start the app

## alternative fix

if the manual script doesn't work, try:

```bash
# remove electron completely
bun remove electron

# reinstall and force scripts to run
bun add -D electron@^37.3.1

# manually run install script
node node_modules/.bun/electron@*/node_modules/electron/install.js
```

## prevention

when setting up a fresh clone:

```bash
# after initial bun install
node node_modules/.bun/electron@*/node_modules/electron/install.js
```

this ensures electron's binary is always downloaded, even if bun skips the postinstall hook.
