#!/usr/bin/env bash

# Desktop App Release Script
# Based on apps/desktop/RELEASE.md
#
# Usage:
#   ./create-release.sh <version>
#   Example: ./create-release.sh 0.0.1
#
# This script will:
# 1. Verify prerequisites (clean git, GitHub CLI authenticated)
# 2. Update package.json version
# 3. Verify build works locally
# 4. Create and push a git tag to trigger the release workflow
# 5. Monitor the GitHub Actions workflow in real-time
# 6. Display the draft release URL when ready
#
# Requirements:
# - GitHub CLI (gh) installed and authenticated
# - Clean working directory
# - Running from monorepo root

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

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    error "GitHub CLI (gh) is required but not installed.\nInstall it from: https://cli.github.com/"
fi

# Check if authenticated with gh
if ! gh auth status &> /dev/null; then
    error "Not authenticated with GitHub CLI.\nRun: gh auth login"
fi

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

# Get repository information
REPO=$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')

# 7. Monitor the workflow
info "Monitoring GitHub Actions workflow..."
echo "  Waiting for workflow to start (this may take a few seconds)..."

# Wait and retry to find the workflow run
MAX_RETRIES=6
RETRY_COUNT=0
WORKFLOW_RUN=""

while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ -z "$WORKFLOW_RUN" ]; do
    sleep 5
    WORKFLOW_RUN=$(gh run list --workflow=release-desktop.yml --json databaseId,headBranch,status --jq ".[] | select(.headBranch == \"${TAG_NAME}\") | .databaseId" | head -1)
    RETRY_COUNT=$((RETRY_COUNT + 1))

    if [ -z "$WORKFLOW_RUN" ] && [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        echo "  Still waiting... (attempt $RETRY_COUNT/$MAX_RETRIES)"
    fi
done

if [ -z "$WORKFLOW_RUN" ]; then
    warn "Could not find workflow run automatically"
    echo "  Manual monitoring URL:"
    echo "  https://github.com/${REPO}/actions"
    echo ""
    warn "The workflow may still be starting. Check the URL above in a few moments."
else
    success "Found workflow run: ${WORKFLOW_RUN}"
    echo ""
    info "Watching workflow progress..."
    echo "  View in browser: https://github.com/${REPO}/actions/runs/${WORKFLOW_RUN}"
    echo ""

    # Watch the workflow (this will stream the status)
    gh run watch "${WORKFLOW_RUN}" || warn "Workflow monitoring interrupted"

    # Check final status
    WORKFLOW_STATUS=$(gh run view "${WORKFLOW_RUN}" --json conclusion --jq .conclusion)

    if [ "$WORKFLOW_STATUS" == "success" ]; then
        success "Workflow completed successfully!"
    elif [ "$WORKFLOW_STATUS" == "failure" ]; then
        error "Workflow failed. Please check the logs at: https://github.com/${REPO}/actions/runs/${WORKFLOW_RUN}"
    else
        warn "Workflow ended with status: ${WORKFLOW_STATUS}"
    fi
fi

echo ""

# 8. Get and display draft release URL
info "Fetching draft release..."

# Retry logic for draft release (it may take time to be created)
MAX_RELEASE_RETRIES=10
RELEASE_RETRY_COUNT=0
RELEASE_FOUND=""

while [ $RELEASE_RETRY_COUNT -lt $MAX_RELEASE_RETRIES ] && [ -z "$RELEASE_FOUND" ]; do
    sleep 3
    RELEASE_FOUND=$(gh release list --json tagName,isDraft --jq ".[] | select(.tagName == \"${TAG_NAME}\" and .isDraft == true) | .tagName")
    RELEASE_RETRY_COUNT=$((RELEASE_RETRY_COUNT + 1))

    if [ -z "$RELEASE_FOUND" ] && [ $RELEASE_RETRY_COUNT -lt $MAX_RELEASE_RETRIES ]; then
        echo "  Waiting for draft release to be created... (attempt $RELEASE_RETRY_COUNT/$MAX_RELEASE_RETRIES)"
    fi
done

if [ -z "$RELEASE_FOUND" ]; then
    warn "Draft release not found yet. It may still be processing."
    echo "  Check releases at: https://github.com/${REPO}/releases"
else
    RELEASE_URL="https://github.com/${REPO}/releases/tag/${TAG_NAME}"
    success "Draft release created!"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}📦 Draft Release URL:${NC}"
    echo -e "${GREEN}${RELEASE_URL}${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
fi

echo ""
info "Next steps:"
echo "  1. Review the draft release and edit release notes if needed"
echo "  2. Publish the release when ready"
echo ""
info "Release artifacts will include:"
echo "  • Superset-${VERSION}-arm64.dmg (macOS DMG installer)"
echo "  • Superset-${VERSION}-arm64-mac.zip (macOS zipped app bundle)"
echo ""
