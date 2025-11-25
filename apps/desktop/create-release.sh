#!/usr/bin/env bash

# Desktop App Release Script
# Based on apps/desktop/RELEASE.md
#
# Usage:
#   ./create-release-0.0.1.sh <version>
#   Example: ./create-release-0.0.1.sh 0.0.1
#
# This script will:
# 1. Verify prerequisites (clean git, build works)
# 2. Update package.json version
# 3. Create and push a git tag to trigger the release workflow
# 4. The GitHub Action will build for macOS (arm64) and create a draft release

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

# Check if version argument is provided
if [ -z "$1" ]; then
    error "Usage: $0 <version>\nExample: $0 0.0.1"
fi

VERSION="$1"
TAG_NAME="desktop-v${VERSION}"
DESKTOP_DIR="apps/desktop"

info "Starting release process for version ${VERSION}"
echo ""

# Check if we're in the monorepo root
if [ ! -f "package.json" ] || [ ! -d "apps/desktop" ]; then
    error "Please run this script from the monorepo root directory"
fi

# Navigate to desktop app directory
cd "${DESKTOP_DIR}"

# 1. Check for uncommitted changes
info "Checking for uncommitted changes..."
if ! git diff-index --quiet HEAD --; then
    error "You have uncommitted changes. Please commit or stash them first."
fi
success "Working directory is clean"

# 2. Check if tag already exists
info "Checking if tag ${TAG_NAME} already exists..."
if git rev-parse "${TAG_NAME}" >/dev/null 2>&1; then
    error "Tag ${TAG_NAME} already exists. Use a different version or delete the existing tag."
fi
success "Tag ${TAG_NAME} is available"

# 3. Update version in package.json
info "Updating version in package.json..."
CURRENT_VERSION=$(node -p "require('./package.json').version")
if [ "${CURRENT_VERSION}" == "${VERSION}" ]; then
    warn "package.json already has version ${VERSION}"
else
    # Use bun to update the version
    bun version "${VERSION}" --no-git-tag-version
    success "Updated package.json from ${CURRENT_VERSION} to ${VERSION}"

    # Commit the version change
    git add package.json
    git commit -m "chore(desktop): bump version to ${VERSION}"
    success "Committed version change"
fi

# 4. Verify build works locally
info "Testing build locally (this may take a few minutes)..."
info "Running: bun run package"
if ! bun run package; then
    error "Build failed. Please fix the issues before releasing."
fi
success "Build completed successfully"

# 5. Push changes
info "Pushing changes to remote..."
CURRENT_BRANCH=$(git branch --show-current)
git push origin "${CURRENT_BRANCH}"
success "Changes pushed to ${CURRENT_BRANCH}"

# 6. Create and push tag
info "Creating tag ${TAG_NAME}..."
git tag "${TAG_NAME}"
success "Tag ${TAG_NAME} created"

info "Pushing tag to trigger release workflow..."
git push origin "${TAG_NAME}"
success "Tag pushed to remote"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 Release process initiated successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
info "Next steps:"
echo "  1. Monitor the GitHub Actions workflow at:"
echo "     https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/actions"
echo ""
echo "  2. Once the workflow completes, a draft release will be created"
echo ""
echo "  3. Review the draft release at:"
echo "     https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/releases"
echo ""
echo "  4. Edit the release notes if needed and publish the release"
echo ""
info "Release artifacts will include:"
echo "  • Superset-${VERSION}-arm64.dmg (macOS DMG installer)"
echo "  • Superset-${VERSION}-arm64-mac.zip (macOS zipped app bundle)"
echo ""
