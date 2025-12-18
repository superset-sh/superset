# Implementation details
For Electron interprocess communnication, ALWAYS use trpc as defined in `src/lib/trpc`
Please use alias as defined in `tsconfig.json` when possible
Prefer zustand for state management if it makes sense. Do not use effect unless absolutely necessary.