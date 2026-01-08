#!/usr/bin/env bash

# Desktop App Release Script
# Based on apps/desktop/RELEASE.md
#
# Usage:
#   ./create-release.sh <version> [--publish]
#   Example: ./create-release.sh 0.0.1
#   Example: ./create-release.sh 0.0.1 --publish
#
# This script will:
# 1. Verify prerequisites (clean git, GitHub CLI authenticated)
# 2. Delete existing release/tag if republishing same version
# 3. Update package.json version
# 4. Push changes and create a PR if not on main branch
# 5. Create and push a git tag to trigger the release workflow
# 6. Monitor the GitHub Actions workflow in real-time
# 7. Leave release as draft (default) or auto-publish with --publish flag
#
# Features:
# - Supports republishing: Running with same version will clean up and rebuild
# - Draft by default for review before publishing
# - Use --publish flag to auto-publish when build completes
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

# Parse arguments
VERSION=""
AUTO_PUBLISH=false

for arg in "$@"; do
    case $arg in
        --publish)
            AUTO_PUBLISH=true
            ;;
        -*)
            error "Unknown option: $arg\nUsage: $0 <version> [--publish]"
            ;;
        *)
            if [ -z "$VERSION" ]; then
                VERSION="$arg"
            else
                error "Unexpected argument: $arg\nUsage: $0 <version> [--publish]"
            fi
            ;;
    esac
done

if [ -z "$VERSION" ]; then
    error "Usage: $0 <version> [--publish]\nExample: $0 0.0.1"
fi

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

# 2. Check if tag/release already exists
info "Checking if tag ${TAG_NAME} already exists..."
if git rev-parse "${TAG_NAME}" >/dev/null 2>&1; then
    echo ""
    warn "Tag ${TAG_NAME} already exists!"

    # Check if there's also a GitHub release
    if gh release view "${TAG_NAME}" &>/dev/null; then
        RELEASE_STATUS=$(gh release view "${TAG_NAME}" --json isDraft --jq 'if .isDraft then "draft" else "published"' 2>/dev/null || echo "unknown")
        echo -e "  GitHub release: ${YELLOW}${RELEASE_STATUS}${NC}"
    else
        echo -e "  GitHub release: ${YELLOW}none${NC}"
    fi
    echo ""

    # Ask user what to do
    echo "What would you like to do?"
    echo "  1) Republish - Delete existing release/tag and create new one"
    echo "  2) Cancel - Exit without changes"
    echo ""
    read -p "Enter choice [1-2]: " choice

    case $choice in
        1)
            info "Cleaning up for republish..."

            # Delete the GitHub release if it exists
            if gh release view "${TAG_NAME}" &>/dev/null; then
                info "Deleting existing GitHub release..."
                gh release delete "${TAG_NAME}" --yes
                success "Deleted existing release"
            fi

            # Delete remote tag
            info "Deleting remote tag..."
            git push origin --delete "${TAG_NAME}" 2>/dev/null || true
            success "Deleted remote tag"

            # Delete local tag
            info "Deleting local tag..."
            git tag -d "${TAG_NAME}" 2>/dev/null || true
            success "Deleted local tag"
            ;;
        2|*)
            info "Cancelled. No changes made."
            exit 0
            ;;
    esac
fi
success "Tag ${TAG_NAME} is available"

# 3. Update version in package.json
info "Updating version in package.json..."
CURRENT_VERSION=$(node -p "require('./package.json').version")
if [ "${CURRENT_VERSION}" == "${VERSION}" ]; then
    warn "package.json already has version ${VERSION}"
else
    # Update the version using jq to handle workspace dependencies
    TMP_FILE=$(mktemp)
    jq ".version = \"${VERSION}\"" package.json > "${TMP_FILE}" && mv "${TMP_FILE}" package.json
    # Format package.json to match project conventions (jq reformats the JSON)
    bunx biome format --write package.json
    success "Updated package.json from ${CURRENT_VERSION} to ${VERSION}"

    # Commit the version change
    git add package.json
    git commit -m "chore(desktop): bump version to ${VERSION}"
    success "Committed version change"
fi

# 4. Push changes and create PR if needed
info "Pushing changes to remote..."
CURRENT_BRANCH=$(git branch --show-current)
git push origin "${CURRENT_BRANCH}"
success "Changes pushed to ${CURRENT_BRANCH}"

# Create PR if not on main branch
MAIN_BRANCH="main"
if [ "${CURRENT_BRANCH}" != "${MAIN_BRANCH}" ]; then
    # Check if PR already exists for this branch
    EXISTING_PR=$(gh pr list --head "${CURRENT_BRANCH}" --json number --jq '.[0].number' 2>/dev/null || echo "")

    if [ -n "$EXISTING_PR" ]; then
        info "PR #${EXISTING_PR} already exists for branch ${CURRENT_BRANCH}"
    else
        info "Creating pull request..."
        PR_URL=$(gh pr create \
            --title "chore(desktop): bump version to ${VERSION}" \
            --body "Bumps desktop app version to ${VERSION}.

This PR was automatically created by the release script." \
            --base "${MAIN_BRANCH}" \
            --head "${CURRENT_BRANCH}" 2>&1)

        if [ $? -eq 0 ]; then
            success "Pull request created: ${PR_URL}"
        else
            warn "Could not create PR: ${PR_URL}"
        fi
    fi
fi

# 5. Create and push tag
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

# 6. Monitor the workflow
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

# 7. Wait for release and publish it
info "Waiting for draft release to be created..."

# Retry logic for draft release (it may take time to be created)
MAX_RELEASE_RETRIES=10
RELEASE_RETRY_COUNT=0
RELEASE_FOUND=""

while [ $RELEASE_RETRY_COUNT -lt $MAX_RELEASE_RETRIES ] && [ -z "$RELEASE_FOUND" ]; do
    sleep 3
    RELEASE_FOUND=$(gh release list --json tagName,isDraft --jq ".[] | select(.tagName == \"${TAG_NAME}\") | .tagName")
    RELEASE_RETRY_COUNT=$((RELEASE_RETRY_COUNT + 1))

    if [ -z "$RELEASE_FOUND" ] && [ $RELEASE_RETRY_COUNT -lt $MAX_RELEASE_RETRIES ]; then
        echo "  Waiting for release to be created... (attempt $RELEASE_RETRY_COUNT/$MAX_RELEASE_RETRIES)"
    fi
done

if [ -z "$RELEASE_FOUND" ]; then
    warn "Release not found yet. It may still be processing."
    echo "  Check releases at: https://github.com/${REPO}/releases"
else
    RELEASE_URL="https://github.com/${REPO}/releases/tag/${TAG_NAME}"
    LATEST_URL="https://github.com/${REPO}/releases/latest"

    if [ "$AUTO_PUBLISH" = true ]; then
        # Publish the release
        info "Publishing release..."
        gh release edit "${TAG_NAME}" --draft=false
        success "Release published!"

        echo ""
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}🎉 Release Published!${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        echo -e "${BLUE}Release URL:${NC} ${RELEASE_URL}"
        echo -e "${BLUE}Latest URL:${NC}  ${LATEST_URL}"
        echo ""
        echo -e "${BLUE}Direct downloads:${NC}"
        echo "  macOS:"
        echo "    • ${LATEST_URL}/download/Superset-arm64.dmg"
        echo "  Linux:"
        echo "    • ${LATEST_URL}/download/superset-x64.AppImage"
        echo "    • ${LATEST_URL}/download/superset-arm64.AppImage"
        echo "    • ${LATEST_URL}/download/superset-amd64.deb"
        echo "    • ${LATEST_URL}/download/superset-arm64.deb"
        echo ""
    else
        success "Draft release created!"

        echo ""
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}📝 Draft Release Ready for Review${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        echo -e "${BLUE}Review URL:${NC} ${RELEASE_URL}"
        echo ""
        echo "To publish:"
        echo "  gh release edit ${TAG_NAME} --draft=false"
        echo ""
    fi
fi
