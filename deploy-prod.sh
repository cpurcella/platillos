#!/usr/bin/env bash
set -euo pipefail

npx -y claudia update --version prod --config claudia.json
