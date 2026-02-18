#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# macOS Code Signing & Notarization Setup for Superset Desktop
# =============================================================================
#
# This script helps set up code signing for local builds.
#
# Prerequisites:
#   - Apple Developer account ($99/year) at https://developer.apple.com
#   - Xcode or Xcode Command Line Tools installed
#
# Usage:
#   ./scripts/setup-signing.sh          # Interactive setup
#   ./scripts/setup-signing.sh --check  # Check current signing status
#   ./scripts/setup-signing.sh --build  # Build signed .dmg
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$DESKTOP_DIR/.env.signing"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()   { echo -e "${RED}[error]${NC} $*"; }

# -----------------------------------------------------------------------------
# Check: list signing identities
# -----------------------------------------------------------------------------
check_identities() {
  echo ""
  info "Scanning Keychain for code signing identities..."
  echo ""

  local dev_id_app
  dev_id_app=$(security find-identity -v -p codesigning | grep "Developer ID Application" || true)

  local apple_dev
  apple_dev=$(security find-identity -v -p codesigning | grep "Apple Development" || true)

  local apple_dist
  apple_dist=$(security find-identity -v -p codesigning | grep "Apple Distribution" || true)

  if [ -n "$dev_id_app" ]; then
    ok "Developer ID Application (for distribution outside App Store):"
    echo "   $dev_id_app"
  else
    warn "No 'Developer ID Application' certificate found."
    echo "   This is needed to distribute signed builds outside the App Store."
    echo "   Create one at: https://developer.apple.com/account/resources/certificates/add"
    echo "   Select: 'Developer ID Application'"
  fi

  echo ""

  if [ -n "$apple_dev" ]; then
    ok "Apple Development (for local testing):"
    echo "   $apple_dev"
  else
    warn "No 'Apple Development' certificate found."
  fi

  if [ -n "$apple_dist" ]; then
    ok "Apple Distribution:"
    echo "   $apple_dist"
  fi

  echo ""
  info "All identities:"
  security find-identity -v -p codesigning
  echo ""
}

# -----------------------------------------------------------------------------
# Check: current signing setup status
# -----------------------------------------------------------------------------
check_status() {
  echo ""
  echo "=========================================="
  echo " Superset Desktop - Signing Status"
  echo "=========================================="

  # Certificates
  check_identities

  # Entitlements
  local ent_parent="$DESKTOP_DIR/src/resources/build/entitlements.mac.plist"
  local ent_child="$DESKTOP_DIR/src/resources/build/entitlements.mac.inherit.plist"

  if [ -f "$ent_parent" ]; then
    ok "Parent entitlements: $ent_parent"
  else
    err "Missing parent entitlements: $ent_parent"
  fi

  if [ -f "$ent_child" ]; then
    ok "Child entitlements:  $ent_child"
  else
    err "Missing child entitlements: $ent_child"
  fi

  # Env file
  echo ""
  if [ -f "$ENV_FILE" ]; then
    ok "Signing env file: $ENV_FILE"
    echo "   Contents (secrets redacted):"
    while IFS= read -r line; do
      if [[ "$line" =~ ^# ]] || [[ -z "$line" ]]; then
        continue
      fi
      key="${line%%=*}"
      val="${line#*=}"
      if [[ "$key" == *"PASSWORD"* ]] || [[ "$key" == *"SECRET"* ]] || [[ "$key" == *"KEY"* ]]; then
        echo "   $key=****"
      else
        echo "   $line"
      fi
    done < "$ENV_FILE"
  else
    warn "No .env.signing file found. Run this script without --check to create one."
  fi

  echo ""
}

# -----------------------------------------------------------------------------
# Interactive setup
# -----------------------------------------------------------------------------
setup() {
  echo ""
  echo "=========================================="
  echo " Superset Desktop - Signing Setup"
  echo "=========================================="
  echo ""

  # Step 1: Check certificates
  info "Step 1: Checking certificates..."
  check_identities

  local dev_id_app
  dev_id_app=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 || true)

  local identity=""

  if [ -n "$dev_id_app" ]; then
    # Extract the identity name between quotes
    identity=$(echo "$dev_id_app" | sed 's/.*"\(.*\)".*/\1/')
    ok "Found: $identity"
    echo ""
    read -rp "Use this identity? [Y/n] " use_found
    if [[ "$use_found" =~ ^[Nn] ]]; then
      identity=""
    fi
  fi

  if [ -z "$identity" ]; then
    echo ""
    warn "No Developer ID Application certificate found."
    echo ""
    echo "You have two options:"
    echo ""
    echo "  1) Create a 'Developer ID Application' certificate"
    echo "     - Go to https://developer.apple.com/account/resources/certificates/add"
    echo "     - Select 'Developer ID Application'"
    echo "     - Follow the CSR process (Keychain Access > Certificate Assistant > Request...)"
    echo "     - Download and double-click the .cer to install"
    echo ""
    echo "  2) Use your existing Apple Development cert (for local testing only)"
    echo ""

    local apple_dev
    apple_dev=$(security find-identity -v -p codesigning | grep "Apple Development" | head -1 || true)

    if [ -n "$apple_dev" ]; then
      identity=$(echo "$apple_dev" | sed 's/.*"\(.*\)".*/\1/')
      read -rp "Use '$identity' for local builds? [Y/n] " use_dev
      if [[ "$use_dev" =~ ^[Nn] ]]; then
        echo ""
        read -rp "Enter signing identity manually (or press Enter to skip): " identity
      fi
    else
      read -rp "Enter signing identity manually (or press Enter to skip): " identity
    fi
  fi

  # Step 2: Team ID
  echo ""
  info "Step 2: Apple Team ID"
  echo "  Find your Team ID at: https://developer.apple.com/account#MembershipDetailsCard"
  echo ""

  local team_id=""
  read -rp "Enter your Apple Team ID (10-char alphanumeric): " team_id

  # Step 3: Notarization (only needed for distribution)
  echo ""
  info "Step 3: Notarization setup (optional, for distribution builds)"
  echo ""
  echo "  Notarization requires either:"
  echo "    a) Apple ID + app-specific password"
  echo "    b) App Store Connect API key (recommended for CI)"
  echo ""

  local notarize="false"
  local apple_id=""
  local apple_password=""
  local api_key=""
  local api_key_id=""
  local api_issuer=""

  read -rp "Set up notarization? [y/N] " do_notarize
  if [[ "$do_notarize" =~ ^[Yy] ]]; then
    notarize="true"
    echo ""
    echo "  Choose method:"
    echo "    1) Apple ID + app-specific password"
    echo "    2) App Store Connect API key"
    echo ""
    read -rp "  Method [1/2]: " method

    if [ "$method" = "2" ]; then
      echo ""
      echo "  Create an API key at: https://appstoreconnect.apple.com/access/integrations/api"
      echo "  Download the .p8 key file and note the Key ID and Issuer ID."
      echo ""
      read -rp "  Path to .p8 key file: " api_key
      read -rp "  API Key ID: " api_key_id
      read -rp "  Issuer ID: " api_issuer
    else
      echo ""
      echo "  Create an app-specific password at: https://appleid.apple.com/account/manage"
      echo "  (Sign in > App-Specific Passwords > Generate)"
      echo ""
      read -rp "  Apple ID (email): " apple_id
      read -rsp "  App-specific password: " apple_password
      echo ""
    fi
  fi

  # Step 4: Write .env.signing
  echo ""
  info "Step 4: Writing $ENV_FILE"

  cat > "$ENV_FILE" <<EOF
# =============================================================================
# macOS Code Signing Configuration
# Generated by setup-signing.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# =============================================================================
# Source this file before building:
#   source .env.signing && bun run build:signed
# =============================================================================

# Signing identity (from Keychain)
CSC_NAME=${identity}

# Apple Team ID
APPLE_TEAM_ID=${team_id}

# Enable notarization (set to "true" for distribution builds)
APPLE_NOTARIZE=${notarize}
EOF

  if [ "$notarize" = "true" ]; then
    if [ -n "$api_key" ]; then
      cat >> "$ENV_FILE" <<EOF

# App Store Connect API Key (for notarization)
APPLE_API_KEY=${api_key}
APPLE_API_KEY_ID=${api_key_id}
APPLE_API_ISSUER=${api_issuer}
EOF
    else
      cat >> "$ENV_FILE" <<EOF

# Apple ID credentials (for notarization)
APPLE_ID=${apple_id}
APPLE_PASSWORD=${apple_password}
EOF
    fi
  fi

  ok "Written to $ENV_FILE"

  # Add to .gitignore if not already there
  local gitignore="$DESKTOP_DIR/.gitignore"
  if [ -f "$gitignore" ]; then
    if ! grep -q ".env.signing" "$gitignore" 2>/dev/null; then
      echo ".env.signing" >> "$gitignore"
      ok "Added .env.signing to .gitignore"
    fi
  else
    echo ".env.signing" > "$gitignore"
    ok "Created .gitignore with .env.signing"
  fi

  echo ""
  echo "=========================================="
  echo " Setup complete!"
  echo "=========================================="
  echo ""
  echo " To build a signed app:"
  echo ""
  echo "   source apps/desktop/.env.signing"
  echo "   cd apps/desktop"
  echo "   bun run prebuild && bun run package"
  echo ""
  echo " Or use the shortcut:"
  echo ""
  echo "   ./scripts/setup-signing.sh --build"
  echo ""
}

# -----------------------------------------------------------------------------
# Build signed .dmg
# -----------------------------------------------------------------------------
build_signed() {
  echo ""
  info "Building signed Superset Desktop..."
  echo ""

  if [ -f "$ENV_FILE" ]; then
    info "Loading $ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  else
    err "No .env.signing found. Run: ./scripts/setup-signing.sh"
    exit 1
  fi

  if [ -z "${CSC_NAME:-}" ]; then
    err "CSC_NAME not set. Run setup first."
    exit 1
  fi

  info "Signing with: $CSC_NAME"
  info "Team ID:      ${APPLE_TEAM_ID:-not set}"
  info "Notarize:     ${APPLE_NOTARIZE:-false}"
  echo ""

  cd "$DESKTOP_DIR"

  info "Compiling app..."
  bun run prebuild

  info "Packaging & signing..."
  bun run package

  echo ""
  ok "Build complete! Output in: $DESKTOP_DIR/release/"
  ls -lh "$DESKTOP_DIR/release/"*.dmg 2>/dev/null || ls -lh "$DESKTOP_DIR/release/" || true
  echo ""
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
case "${1:-}" in
  --check)
    check_status
    ;;
  --build)
    build_signed
    ;;
  --help|-h)
    echo "Usage: $0 [--check|--build|--help]"
    echo ""
    echo "  (no args)  Interactive signing setup"
    echo "  --check    Show current signing status"
    echo "  --build    Build a signed .dmg"
    echo "  --help     Show this help"
    ;;
  *)
    setup
    ;;
esac
