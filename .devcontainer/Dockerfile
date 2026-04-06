# =============================================================================
# Superset Fork DevContainer
# Node.js 22 + Bun 1.3.6 + Turborepo
# =============================================================================

FROM node:22-bookworm

# Versions
ARG BUN_VERSION=1.3.6

# System-Pakete
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    zsh \
    neovim \
    tmux \
    curl \
    jq \
    ca-certificates \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Bun installieren
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s "bun-v${BUN_VERSION}"

# Turbo global installieren (fuer CLI-Zugang)
RUN bun install -g turbo

# vscode User anlegen (non-root)
RUN groupadd --gid 1000 vscode \
    && useradd --uid 1000 --gid 1000 -m -s /bin/zsh vscode \
    && echo "vscode ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/vscode \
    && chmod 0440 /etc/sudoers.d/vscode

# Oh My Zsh fuer vscode User
USER vscode
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended

# Workspace
WORKDIR /workspace

USER vscode
