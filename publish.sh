#!/bin/bash

set -euo pipefail

PACKAGE_NAME="try-as"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/tmp/try-as-npm-cache}"

echo -e "\n🔧 Building transform..."
if ! npm run build:transform; then
    echo "❌ Build failed. Exiting."
    exit 1
fi

echo "📦 Using npm cache: $NPM_CONFIG_CACHE"

read -r -p "✨ Do you want to format the code before publishing? [Y/n] " FORMAT_RESP
FORMAT_RESP=${FORMAT_RESP,,}

if [[ "$FORMAT_RESP" =~ ^(yes|y| ) || -z "$FORMAT_RESP" ]]; then
    echo "🧹 Formatting code..."
    npm run format
fi

echo -e "\n🧪 Running tests"
if ! npm run test; then
    echo "❌ Tests failed. Exiting."
    exit 1
fi

echo -e "\n📋 Verifying publish contents"
if ! npm run pack:dry-run >/dev/null; then
    echo "❌ Package dry-run failed. Exiting."
    exit 1
fi

VERSION=$(node -p "require('./package.json').version")
echo -e "\n📦 Current version: $VERSION"

if [[ "$VERSION" == *"-preview."* ]]; then
    TAG="preview"
elif [[ "$VERSION" == *"-"* ]]; then
    echo "⚠️ Unknown pre-release format. Not publishing."
    exit 1
else
    TAG="latest"
fi

echo ""

read -r -p "✅ All checks passed. Ready to publish $PACKAGE_NAME@$VERSION with tag '$TAG'? [Y/n] " PUBLISH_RESP
PUBLISH_RESP=${PUBLISH_RESP,,}

if [[ "$PUBLISH_RESP" =~ ^(n|no)$ ]]; then
    echo "❌ Publish canceled by user. Exiting."
    exit 0
fi

echo -e "\n🚀 Publishing $PACKAGE_NAME@$VERSION with tag '$TAG'...\n"
npm publish --tag "$TAG"
echo -e "\n✅ Published successfully."

echo -e "\n🎉 Done."
