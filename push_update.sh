#!/usr/bin/env bash
# ==============================================================================
# 7BANK / OCAPAY GATEWAY - AUTO PACKAGER & GIT RELEASE PUSHER (LINUX / BASH)
# ==============================================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if command -v python3 >/dev/null 2>&1; then
    python3 package_and_push.py "$@"
elif command -v python >/dev/null 2>&1; then
    python package_and_push.py "$@"
else
    echo "[LỖI] Không tìm thấy Python trên hệ thống!"
    exit 1
fi
