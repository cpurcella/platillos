#!/usr/bin/env bash
set -euo pipefail

AWS_PROFILE="${AWS_PROFILE:-platillos-copilot}"
export AWS_PROFILE

npx -y claudia update --version prod --config claudia.json
