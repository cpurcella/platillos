#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
git diff --quiet
git diff --cached --quiet
if [ "$(node -p 'process.versions.node.split(".")[0]')" != 22 ]; then
    echo 'Build with Node.js 22 (nvm use 22).' >&2
    exit 1
fi
release_root=$(pwd)
release_commit=$(git rev-parse HEAD)
release_dir=$(mktemp -d /tmp/platillos-release.XXXXXX)
chmod 700 "$release_dir"
git archive HEAD -- ai api public views certs db aiApprovals.js aiJobQueue.js app.js awsClientConfig.js config.js connections.js lambda.js softLaunch.js templates.js package.json package-lock.json | tar -x -C "$release_dir"
cd "$release_dir"
npm ci --omit=dev --ignore-scripts --no-fund --no-audit
# bcrypt ships Linux x86_64 N-API prebuilds in its npm distribution. Require the
# intended target binary in every archive, including when building on macOS.
test -s node_modules/bcrypt/prebuilds/linux-x64/bcrypt.glibc.node
node -e 'require("bcrypt"); require("mysql2"); require("jimp"); require("@aws-sdk/client-s3")'
RELEASE_COMMIT="$release_commit" node <<'NODE'
require('fs').writeFileSync('public/release.json', JSON.stringify({ commit: process.env.RELEASE_COMMIT }, null, 2) + '\n');
NODE
mkdir -p "$release_root/dist"
release_zip="$release_root/dist/platillos-$release_commit.zip"
zip -q -r "$release_zip" .
if unzip -Z1 "$release_zip" | rg '(^|/)(\.env[^/]*|\.git)(/|$)|^node_modules/(playwright|jest)(/|$)'; then
    echo 'Unexpected secret/development file in release package.' >&2
    exit 1
fi
printf 'Release package: %s\n' "$release_zip"
shasum -a 256 "$release_zip"
printf 'Staging directory (no secrets): %s\n' "$release_dir"
