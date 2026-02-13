#!/usr/bin/env bash
set -euo pipefail

# Simple test suite for hashline CLI

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

cd "$(dirname "$0")"

# Determine binary to use
if [ -x "bin/$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m)" ]; then
    BIN="bin/$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m)"
elif [ -x "hashline_go" ]; then
    BIN="./hashline_go"
elif command -v node >/dev/null && [ -f "hashline.js" ]; then
    BIN="node hashline.js"
else
    echo "No binary available. Build with: go build -o hasline_go hashline.go" >&2
    exit 1
fi

echo "Using binary: $BIN"

# Helper to run hashline
run() {
    "$BIN" "$@"
}

# Test 1: Create a simple file
cat > "$TMPDIR/simple.go" <<'EOF'
package main

import "fmt"

func main() {
    fmt.Println("Hello")
}
EOF

echo "Test 1: Read simple file"
OUTPUT=$(run read "$TMPDIR/simple.go")
echo "$OUTPUT" | head -5

# Verify format
if ! echo "$OUTPUT" | head -1 | grep -qE '^\d+:[0-9a-f]+\|'; then
    echo "FAIL: Unexpected output format" >&2
    exit 1
fi

# Extract hash of line containing Hello
HELLO_HASH=$(echo "$OUTPUT" | grep 'Hello' | head -1 | cut -d: -f2 | cut -d'|' -f1)
echo "Hello line hash: $HELLO_HASH"

echo "Test 2: Replace line"
run edit "$TMPDIR/simple.go" replace_line "$HELLO_HASH" '    fmt.Println("Hi")'

# Verify change
if ! grep -q 'Hi' "$TMPDIR/simple.go"; then
    echo "FAIL: Replace did not apply" >&2
    exit 1
fi

# Get new hashes after edit
NEW_OUTPUT=$(run read "$TMPDIR/simple.go")
NEW_HELLO_HASH=$(echo "$NEW_OUTPUT" | grep 'Hi' | head -1 | cut -d: -f2 | cut -d'|' -f1)
echo "New hash after edit: $NEW_HELLO_HASH"

if [ "$HELLO_HASH" = "$NEW_HELLO_HASH" ]; then
    echo "FAIL: Hash should have changed after edit" >&2
    exit 1
fi

echo "Test 3: Stale hash should fail"
if run edit "$TMPDIR/simple.go" replace_line "$HELLO_HASH" 'test' 2>/dev/null; then
    echo "FAIL: Should have rejected stale hash" >&2
    exit 1
fi
echo "Stale hash correctly rejected"

echo "Test 4: Range replace"
# Get first and last line hashes of the file
FIRST_HASH=$(echo "$NEW_OUTPUT" | head -1 | cut -d: -f2 | cut -d'|' -f1)
LAST_HASH=$(echo "$NEW_OUTPUT" | tail -1 | head -n1 | cut -d: -f2 | cut -d'|' -f1)
echo "Range: $FIRST_HASH-$LAST_HASH"

run edit "$TMPDIR/simple.go" replace_range "$FIRST_HASH-$LAST_HASH" 'package main'

if grep -q 'import' "$TMPDIR/simple.go"; then
    echo "FAIL: Range replace should have removed imports" >&2
    exit 1
fi

echo "Test 5: Insert after"
# Create multi-line file
cat > "$TMPDIR/lines.txt" <<'EOF'
a
b
c
d
e
EOF

OUTPUT=$(run read "$TMPDIR/lines.txt")
C_HASH=$(echo "$OUTPUT" | awk -F: '/^3:/ {print $2}' | cut -d'|' -f1)
echo "Line 3 hash: $C_HASH"

run edit "$TMPDIR/lines.txt" insert_after "$C_HASH" 'inserted'
if ! grep -q 'inserted' "$TMPDIR/lines.txt"; then
    echo "FAIL: Insert after did not work" >&2
    exit 1
fi

echo "Test 6: Hash chain on identical lines"
# Create file with many identical lines
printf 'x\n%.0s' {1..20} > "$TMPDIR/dup.txt"
OUTPUT=$(run read "$TMPDIR/dup.txt")
# Should have duplicate hashes for lines beyond window size
echo "$OUTPUT" | cut -d: -f2 | uniq -d | head -1
DUP_HASH=$(echo "$OUTPUT" | cut -d: -f2 | uniq -d | head -1)
if [ -z "$DUP_HASH" ]; then
    echo "No duplicate hashes found (unexpected but not an error)" >&2
else
    echo "Duplicate hash detected: $DUP_HASH — testing chain disambiguation"
    # Build chain: use the line just before the 10th occurrence
    # We'll get hash of line 5 (should be unique as it's within window start)
    CHAIN_HASH=$(echo "$OUTPUT" | sed -n '5p' | cut -d: -f2 | cut -d'|' -f1)
    TARGET_LINE=$((5 + 5))  # line 10
    TARGET_HASH=$(echo "$OUTPUT" | sed -n "${TARGET_LINE}p" | cut -d: -f2 | cut -d'|' -f1)
    CHAIN="$CHAIN_HASH $TARGET_HASH"
    echo "Editing line $TARGET_LINE with chain: $CHAIN"
    run edit "$TMPDIR/dup.txt" replace_line "$CHAIN" 'CHANGED'
    if ! grep -q 'CHANGED' "$TMPDIR/dup.txt"; then
        echo "FAIL: Chain edit failed" >&2
        exit 1
    fi
fi

echo ""
echo "All tests passed!"
