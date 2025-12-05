<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->
<div align="center">
<img width="600" alt="supersetlogo" src="https://github.com/user-attachments/assets/43c1bde8-93f5-4f53-9db4-187f632051a2" />


<h3 align="center">Superset</h3>
  <p align="center">
    Run 10+ parallel coding agents on your machine
  </p>

[![Superset Twitter](https://img.shields.io/badge/@superset_sh-555?logo=x)](https://x.com/superset_sh)

</div>

## A Terminal Built for Coding Agents
Run 10+ CLI coding agents like Claude Code, Codex, etc. in parallel on your machine. 
Spin up new coding tasks while waiting for your current agent to finish. Quickly switch between tasks as they need your attention.

<img alt="example" src="apps/website/public/hero/use-agents.gif" />

## Getting Started

Prerequisites:

1. Install [Bun](https://bun.sh/) (package manager and Node runtime)

2. Clone the repo from GitHub
```
git clone https://github.com/superset-sh/superset.git
```

Install dependencies:
```bash
bun install
```

Run in dev mode:
```bash
bun run dev
```

Build desktop app:
```bash
bun run build
open apps/desktop/release       
```

> [!NOTE]  
> While Electron is cross-platform, Superset Desktop has only been built and tested on **macOS**. Other platforms are currently untested and may not work as expected.

### Usage

For each parallel tasks, Superset uses git worktrees to clone a new branch on your machine. Automate copying env variables, installing dependencies, etc. through a config file (`.superset/config.json`)

<div align="center">
  <img width="600" alt="Creating a worktree" src="apps/website/public/hero/open-worktrees.gif" />
</div>
<br>


Each workspace gets their own organized terminal system. You can create default presets.


<div align="center">
  <img width="600" alt="Managing terminals" src="apps/website/public/hero/manage-terminals.gif" />
</div>
<br>

Superset monitors your running processes, notify you when changes are ready, and help coordinate between multiple agents. 


<div align="center">
<img width="500" alt="Notifications" src="assets/notifs.png" />
</div>
<br>

### Tech Stack


[![Electron](https://img.shields.io/badge/Electron-191970?logo=Electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-%2320232a.svg?logo=react&logoColor=%2361DAFB)](https://reactjs.org/)
[![TailwindCSS](https://img.shields.io/badge/Tailwindcss-%2338B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)](https://bun.sh/)
[![Turborepo](https://img.shields.io/badge/Turborepo-EF4444?logo=turborepo&logoColor=white)](https://turbo.build/)
[![Vite](https://img.shields.io/badge/Vite-%23646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Biome](https://img.shields.io/badge/Biome-339AF0?logo=biome&logoColor=white)](https://biomejs.dev/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle%20ORM-FFE873?logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![Neon](https://img.shields.io/badge/Neon-00E9CA?logo=neon&logoColor=white)](https://neon.tech/)
[![tRPC](https://img.shields.io/badge/tRPC-2596BE?logo=trpc&logoColor=white)](https://trpc.io/)


## Contributing

If you have a suggestion that would make this better, please fork the repo and
create a pull request. You can also
[open issues](https://github.com/superset-sh/superset/issues).

See the [CONTRIBUTING.md](CONTRIBUTING.md) for instructions and code of conduct.

<a href="https://github.com/superset-sh/superset/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=superset-sh/superset" />
</a>

## Cookbook

See tips and motivation under `docs`: [docs/cookbook/README.md](docs/cookbook/README.md).

## Follow Us
- [![Avi Twitter](https://img.shields.io/badge/Avi-@avimakesrobots-555?logo=x)](https://x.com/avimakesrobots)
- [![Kiet Twitter](https://img.shields.io/badge/Kiet-@flyakiet-555?logo=x)](https://x.com/flyakiet)
- [![Satya Twitter](https://img.shields.io/badge/Satya-@saddle_paddle-555?logo=x)](https://x.com/saddle_paddle)

## License

Distributed under the Apache 2.0 License. See [LICENSE.md](LICENSE.md) for more information.

<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[superset-twitter]: https://x.com/supersetdev
[kiet-twitter]: https://x.com/flyakiet
[satya-twitter]: https://x.com/saddle_paddle
[avi-twitter]: https://x.com/avimakesrobots
[contributors-shield]: https://img.shields.io/github/contributors/superset-sh/studio.svg?style=for-the-badge
[contributors-url]: https://github.com/superset-sh/superset/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/superset-sh/studio.svg?style=for-the-badge
[forks-url]: https://github.com/superset-sh/superset/network/members
[stars-shield]: https://img.shields.io/github/stars/superset-sh/studio.svg?style=for-the-badge
[stars-url]: https://github.com/superset-sh/superset/stargazers
[issues-shield]: https://img.shields.io/github/issues/superset-sh/studio.svg?style=for-the-badge
[issues-url]: https://github.com/superset-sh/superset/issues
[license-shield]: https://img.shields.io/github/license/superset-sh/studio.svg?style=for-the-badge
[license-url]: ./LICENSE.txt
[linkedin-shield]: https://img.shields.io/badge/-LinkedIn-black.svg?logo=linkedin&colorB=555
[linkedin-url]: https://www.linkedin.com/company/superset-sh
[twitter-shield]: https://img.shields.io/badge/-Twitter-black?logo=x&colorB=555
[twitter-url]: https://x.com/supersetdev
[discord-shield]: https://img.shields.io/badge/-Discord-black?logo=discord&colorB=555
[discord-url]: https://discord.gg/hERDfFZCsH
[React.js]: https://img.shields.io/badge/react-%2320232a.svg?logo=react&logoColor=%2361DAFB
[React-url]: https://reactjs.org/
[TailwindCSS]: https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?logo=tailwind-css&logoColor=white
[Tailwind-url]: https://tailwindcss.com/
[Electron.js]: https://img.shields.io/badge/Electron-191970?logo=Electron&logoColor=white
[Electron-url]: https://www.electronjs.org/
[Vite.js]: https://img.shields.io/badge/vite-%23646CFF.svg?logo=vite&logoColor=white
[Vite-url]: https://vitejs.dev/
[product-screenshot]: assets/brand.png