#!/usr/bin/env bash
# Runs the full test suite for plg_system_fgcustomrightclick.
# Usage: ./run.sh   (from this tests/ directory, or via any path)
set -uo pipefail
cd "$(dirname "$0")"

fail=0

for f in test_fg_crc*.js; do
    echo "--- $f ---"
    if ! node "$f"; then
        fail=1
    fi
    echo
done

for f in test_fg_crc*.php; do
    echo "--- $f ---"
    if ! php "$f"; then
        fail=1
    fi
    echo
done

if [ "$fail" -eq 0 ]; then
    echo "ALL SUITES PASSED"
else
    echo "ONE OR MORE SUITES FAILED"
fi

exit "$fail"
