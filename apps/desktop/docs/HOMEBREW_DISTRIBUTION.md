# Homebrew Distribution

Superset is distributed via Homebrew using a custom tap at [superset-sh/homebrew-superset](https://github.com/superset-sh/homebrew-superset).

## User Installation

Users can install Superset with:

```bash
brew tap superset-sh/superset
brew install --cask superset
```

To update:

```bash
brew upgrade --cask superset
```

To uninstall:

```bash
brew uninstall --cask superset
brew untap superset-sh/superset
```

## Automated Updates

The Homebrew cask is automatically updated when a new desktop release is published via the `update-homebrew.yml` workflow.

### Setup Requirements

To enable automated updates, you need to configure a GitHub secret:

#### 1. Create a Personal Access Token (PAT)

1. Go to [GitHub Token Settings](https://github.com/settings/tokens?type=beta)
2. Click **Generate new token** (fine-grained)
3. Configure the token:
   - **Token name**: `homebrew-tap-update`
   - **Expiration**: Set as appropriate (recommend 1 year)
   - **Repository access**: Select "Only select repositories" → `superset-sh/homebrew-superset`
   - **Permissions**:
     - Contents: **Read and write**
4. Click **Generate token** and copy it

#### 2. Add the Secret to the Main Repository

Using the GitHub CLI:

```bash
gh secret set HOMEBREW_TAP_TOKEN --repo superset-sh/superset
# Paste the token when prompted
```

Or via the GitHub UI:

1. Go to [Repository Settings → Secrets](https://github.com/superset-sh/superset/settings/secrets/actions)
2. Click **New repository secret**
3. Name: `HOMEBREW_TAP_TOKEN`
4. Value: Paste your PAT
5. Click **Add secret**

### How It Works

1. When a release with tag `desktop-v*` is **published** (not drafted), the workflow triggers
2. The workflow downloads the arm64 DMG from the release
3. Calculates the SHA256 checksum
4. Updates `Casks/superset.rb` in the homebrew-superset repo
5. Commits and pushes the changes

### Manual Updates

If you need to manually update the cask:

```bash
# Clone the tap
git clone https://github.com/superset-sh/homebrew-superset.git
cd homebrew-superset

# Download the DMG and get SHA256
curl -L -o superset.dmg "https://github.com/superset-sh/superset/releases/download/desktop-v<VERSION>/Superset-<VERSION>-arm64.dmg"
shasum -a 256 superset.dmg

# Update Casks/superset.rb with new version and SHA256
# Commit and push
```

## Adding Intel (x64) Support

Currently the cask only supports Apple Silicon (arm64). To add Intel support:

### 1. Update electron-builder.ts

```typescript
mac: {
  target: [
    {
      target: "dmg",
      arch: ["arm64", "x64"],  // Add x64
    },
  ],
}
```

### 2. Update the Cask Formula

```ruby
cask "superset" do
  arch arm: "arm64", intel: "x64"

  version "0.0.56"
  sha256 arm:   "ARM64_SHA256_HERE",
         intel: "X64_SHA256_HERE"

  url "https://github.com/superset-sh/superset/releases/download/desktop-v#{version}/Superset-#{version}-#{arch}.dmg"
  # ... rest of cask
end
```

### 3. Update the Workflow

Modify `.github/workflows/update-homebrew.yml` to calculate SHA256 for both architectures and update both values in the cask.
