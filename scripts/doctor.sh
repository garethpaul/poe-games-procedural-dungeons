#!/usr/bin/env bash
# Diagnostic launcher for a scaffolded Poe tile.
#
# Run from the project root:
#
#   ./scripts/doctor.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(git -C "$PROJECT_ROOT" rev-parse --show-toplevel 2>/dev/null || printf '%s\n' "$PROJECT_ROOT")"
REPO_CLI="$REPO_ROOT/projects/poe-tiles-cli/cli.ts"

if [[ -f "$REPO_CLI" ]] && command -v bun >/dev/null 2>&1; then
	exec bun "$REPO_CLI" doctor --cwd "$PROJECT_ROOT"
fi

if command -v poe-tiles >/dev/null 2>&1; then
	exec poe-tiles doctor --cwd "$PROJECT_ROOT"
fi

if command -v bun >/dev/null 2>&1; then
	exec bunx --bun poe-tiles doctor --cwd "$PROJECT_ROOT"
fi

echo "Could not run Poe Tiles doctor because Bun is not available."
echo "Install Bun from https://bun.sh, then open a new terminal or restart the agent."
exit 1
