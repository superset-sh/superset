#!/bin/sh
# Superset CLI installer
#
# Usage:
#   curl -fsSL https://superset.sh/cli/install.sh | sh
#
# Installs the Superset CLI and host-service to ~/superset/.
# Adds ~/superset/bin to PATH via your shell profile.

set -eu

REPO="superset-sh/superset"
INSTALL_DIR="${SUPERSET_HOME:-$HOME/superset}"
TAG="${SUPERSET_VERSION:-latest}"

BOLD='\033[1m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

info() { printf "${GREEN}==>${RESET} %s\n" "$1" >&2; }
warn() { printf "${YELLOW}warning:${RESET} %s\n" "$1" >&2; }
error() { printf "${RED}error:${RESET} %s\n" "$1" >&2; exit 1; }

detect_target() {
    os="$(uname -s)"
    arch="$(uname -m)"

    case "$os" in
        Darwin)
            case "$arch" in
                arm64) echo "darwin-arm64" ;;
                x86_64) error "Intel Macs are not supported. Apple Silicon (arm64) only." ;;
                *) error "Unsupported macOS architecture: $arch" ;;
            esac
            ;;
        Linux)
            case "$arch" in
                x86_64) echo "linux-x64" ;;
                *) error "Unsupported Linux architecture: $arch (only x64 is supported)" ;;
            esac
            ;;
        *)
            error "Unsupported OS: $os (only macOS and Linux are supported)"
            ;;
    esac
}

resolve_latest_cli_tag() {
    api_url="https://api.github.com/repos/${REPO}/releases?per_page=100"
    resolved="$(curl -fsSL "$api_url" \
        | grep -oE '"tag_name": *"cli-v[^"]+"' \
        | head -n 1 \
        | sed -E 's/.*"(cli-v[^"]+)".*/\1/')"
    if [ -z "$resolved" ]; then
        error "Could not resolve latest cli-v* release from $api_url"
    fi
    echo "$resolved"
}

download_tarball() {
    target="$1"
    tarball="superset-${target}.tar.gz"
    url="https://github.com/${REPO}/releases/download/${TAG}/${tarball}"

    info "Downloading $url"
    tmp="$(mktemp -t superset-install.XXXXXX)"
    if ! curl -fsSL -o "$tmp" "$url"; then
        rm -f "$tmp"
        error "Failed to download $url"
    fi
    echo "$tmp"
}

extract_tarball() {
    tarball="$1"
    info "Extracting to $INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
    tar -xzf "$tarball" -C "$INSTALL_DIR"
    rm -f "$tarball"
}

detect_shell_profile() {
    case "${SHELL:-}" in
        */zsh) echo "$HOME/.zshrc" ;;
        */bash)
            if [ -f "$HOME/.bash_profile" ]; then
                echo "$HOME/.bash_profile"
            else
                echo "$HOME/.bashrc"
            fi
            ;;
        */fish) echo "$HOME/.config/fish/config.fish" ;;
        *) echo "" ;;
    esac
}

update_path() {
    bin_dir="$INSTALL_DIR/bin"

    # Check if it's already in PATH
    case ":$PATH:" in
        *":$bin_dir:"*)
            info "$bin_dir is already in PATH"
            return
            ;;
    esac

    profile="$(detect_shell_profile)"
    if [ -z "$profile" ]; then
        warn "Could not detect your shell profile. Add this to your shell config:"
        printf "  export PATH=\"%s:\$PATH\"\n" "$bin_dir"
        return
    fi

    export_line="export PATH=\"$bin_dir:\$PATH\""
    if [ "$profile" = "$HOME/.config/fish/config.fish" ]; then
        export_line="set -gx PATH $bin_dir \$PATH"
    fi

    if [ -f "$profile" ] && grep -Fq "$bin_dir" "$profile"; then
        info "PATH already configured in $profile"
        return
    fi

    info "Adding $bin_dir to PATH in $profile"
    mkdir -p "$(dirname "$profile")"
    {
        printf "\n# Superset CLI\n"
        printf "%s\n" "$export_line"
    } >> "$profile"
}

main() {
    printf "${BOLD}Installing Superset CLI${RESET}\n\n"

    target="$(detect_target)"
    info "Platform: $target"

    if [ "$TAG" = "latest" ]; then
        TAG="$(resolve_latest_cli_tag)"
        info "Resolved latest CLI release: $TAG"
    fi

    tarball="$(download_tarball "$target")"
    extract_tarball "$tarball"

    # Verify binaries exist and are executable. Tarball already ships them
    # with +x, so this is a sanity check, not a chmod fallback.
    for bin in superset superset-host; do
        path="$INSTALL_DIR/bin/$bin"
        if [ ! -f "$path" ] || [ ! -x "$path" ]; then
            error "Expected executable file not found: $path"
        fi
    done

    update_path

    printf "\n${GREEN}${BOLD}Installed!${RESET}\n"
    printf "Run ${BOLD}superset auth login${RESET} to get started.\n"
    printf "You may need to restart your shell (or run \`source <your-profile>\`) for the PATH to take effect.\n"
}

main "$@"
