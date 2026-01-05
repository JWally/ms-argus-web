#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RUST_DIR="$PROJECT_DIR/rust/wasm-fingerprint"
WASM_DIR="$PROJECT_DIR/wasm"

echo "Building WASM modules..."

# Ensure output directory exists
mkdir -p "$WASM_DIR"

cd "$RUST_DIR"

# Build core (no SIMD)
echo "Building core module..."
wasm-pack build --target web --out-dir "$WASM_DIR/core-pkg" --release

# Build SIMD variant
echo "Building SIMD module..."

# Backup and modify Cargo.toml to add SIMD to wasm-opt flags
cp Cargo.toml Cargo.toml.bak
sed -i 's/wasm-opt = \["-O", "--enable-bulk-memory"\]/wasm-opt = ["-O", "--enable-bulk-memory", "--enable-simd"]/' Cargo.toml

RUSTFLAGS="-C target-feature=+simd128" wasm-pack build --target web --out-dir "$WASM_DIR/simd-pkg" --release --features simd

# Restore original Cargo.toml
mv Cargo.toml.bak Cargo.toml

# Copy the wasm files
cp "$WASM_DIR/core-pkg/wasm_fingerprint_bg.wasm" "$WASM_DIR/core.wasm"
cp "$WASM_DIR/simd-pkg/wasm_fingerprint_bg.wasm" "$WASM_DIR/simd.wasm"

# Report sizes
echo ""
echo "Build complete!"
echo "Core WASM: $(wc -c < "$WASM_DIR/core.wasm" | tr -d ' ') bytes"
echo "SIMD WASM: $(wc -c < "$WASM_DIR/simd.wasm" | tr -d ' ') bytes"
