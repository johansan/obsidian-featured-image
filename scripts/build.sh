#!/bin/bash

# Main build script for obsidian-featured-image
# This script is checked into git

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to project root directory
cd "$SCRIPT_DIR/.."

# Track overall status
BUILD_WARNINGS=0
BUILD_ERRORS=0

# Step 1: Run ESLint
echo "Running ESLint..."
ESLINT_OUTPUT=$(npm run lint 2>&1)
ESLINT_STATUS=$?
echo "$ESLINT_OUTPUT"

# Count ESLint errors and warnings from the summary line
ESLINT_SUMMARY=$(echo "$ESLINT_OUTPUT" | grep "✖" | grep "problem")
if [ -n "$ESLINT_SUMMARY" ]; then
    # Extract error count
    ESLINT_ERROR_COUNT=$(echo "$ESLINT_SUMMARY" | sed -n 's/.*(\([0-9]*\) error.*/\1/p')
    if [ -z "$ESLINT_ERROR_COUNT" ]; then
        ESLINT_ERROR_COUNT=0
    fi
    
    # Extract warning count
    ESLINT_WARNING_COUNT=$(echo "$ESLINT_SUMMARY" | sed -n 's/.* \([0-9]*\) warning.*/\1/p')
    if [ -z "$ESLINT_WARNING_COUNT" ]; then
        ESLINT_WARNING_COUNT=0
    fi
    
    if [ $ESLINT_ERROR_COUNT -gt 0 ]; then
        echo "❌ ESLint found $ESLINT_ERROR_COUNT errors"
        BUILD_ERRORS=$((BUILD_ERRORS + 1))
    elif [ $ESLINT_WARNING_COUNT -gt 0 ]; then
        echo "⚠️  ESLint found $ESLINT_WARNING_COUNT warnings"
        BUILD_WARNINGS=$((BUILD_WARNINGS + 1))
    fi
else
    echo "✅ ESLint passed"
fi

# Step 2: Run TypeScript type checking
echo -e "\nChecking TypeScript types..."
npx tsc --noEmit --skipLibCheck
TSC_STATUS=$?
if [ $TSC_STATUS -ne 0 ]; then
    echo "❌ TypeScript type checking failed"
    BUILD_ERRORS=$((BUILD_ERRORS + 1))
else
    echo "✅ TypeScript types are valid"
    
    # Check for unused imports and variables (warning only)
    echo "Checking for unused imports..."
    UNUSED_COUNT=$(npx tsc --noEmit --noUnusedLocals --noUnusedParameters 2>&1 | grep -c "is declared but\|is defined but")
    if [ $UNUSED_COUNT -gt 0 ]; then
        echo "⚠️  Warning: Found $UNUSED_COUNT unused imports or variables"
        echo "Run 'npx tsc --noEmit --noUnusedLocals --noUnusedParameters' to see details"
        BUILD_WARNINGS=$((BUILD_WARNINGS + 1))
    else
        echo "✅ No unused imports found"
    fi
fi

# Step 3: Check for dead code with Knip (warning only)
echo -e "\nChecking for dead code..."
if command -v knip &> /dev/null || npx --no-install knip --version &> /dev/null 2>&1; then
    KNIP_OUTPUT=$(npx knip --no-progress 2>/dev/null)
    DEAD_FILES=$(echo "$KNIP_OUTPUT" | grep -c "^src/.*\.(ts|tsx)" || true)
    DEAD_EXPORTS=$(echo "$KNIP_OUTPUT" | grep -c "function\|class\|interface\|type\|const" || true)

    if [ $DEAD_FILES -gt 0 ] || [ $DEAD_EXPORTS -gt 0 ]; then
        echo "⚠️  Warning: Found dead code - $DEAD_FILES unused files, $DEAD_EXPORTS unused exports"
        echo "Run 'npx knip' to see details"
        BUILD_WARNINGS=$((BUILD_WARNINGS + 1))
    else
        echo "✅ No dead code found"
    fi
else
    echo "⚠️  Knip not installed - skipping dead code check"
    echo "   Install with: npm install --save-dev knip"
fi

# Step 4: Fix formatting with Prettier
echo -e "\nChecking code formatting..."
# Run prettier and capture output
PRETTIER_OUTPUT=$(npm run format 2>&1)
PRETTIER_STATUS=$?

if [ $PRETTIER_STATUS -ne 0 ]; then
    echo "❌ Failed to fix code formatting"
    echo "$PRETTIER_OUTPUT"
    BUILD_ERRORS=$((BUILD_ERRORS + 1))
else
    # Check if any files were changed
    if echo "$PRETTIER_OUTPUT" | grep -q "(unchanged)"; then
        # Count changed vs unchanged files
        CHANGED_COUNT=$(echo "$PRETTIER_OUTPUT" | grep -v "(unchanged)" | grep -E "\.(ts|tsx|js|jsx|json|md|css).*[0-9]+ms$" | wc -l | tr -d ' ')
        UNCHANGED_COUNT=$(echo "$PRETTIER_OUTPUT" | grep -c "(unchanged)" || true)
        
        if [ $CHANGED_COUNT -eq 0 ]; then
            echo "✅ Code formatting is already correct (all $UNCHANGED_COUNT files unchanged)"
        else
            echo "✅ Code formatting fixed ($CHANGED_COUNT files updated, $UNCHANGED_COUNT unchanged)"
        fi
    else
        # Old prettier version or different output format
        echo "✅ Code formatting complete"
    fi
fi

# Step 5: Check plugin manifest validity
echo -e "\nValidating plugin manifest..."
if [ -f "manifest.json" ]; then
    # Check required fields
    MANIFEST_VALID=true
    MISSING_FIELDS=""
    
    # Check for required fields
    for field in "id" "name" "version" "minAppVersion" "description" "author"; do
        if ! grep -q "\"$field\"" manifest.json; then
            MISSING_FIELDS="$MISSING_FIELDS $field"
            MANIFEST_VALID=false
        fi
    done
    
    if [ "$MANIFEST_VALID" = false ]; then
        echo "❌ manifest.json is missing required fields:$MISSING_FIELDS"
        BUILD_ERRORS=$((BUILD_ERRORS + 1))
    else
        # Check version format (should be x.y.z)
        VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' manifest.json | sed 's/.*"\([^"]*\)"[[:space:]]*$/\1/')
        if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "⚠️  Warning: Version '$VERSION' doesn't follow semantic versioning (x.y.z)"
            BUILD_WARNINGS=$((BUILD_WARNINGS + 1))
        else
            echo "✅ Plugin manifest is valid (v$VERSION)"
        fi
    fi
else
    echo "❌ manifest.json not found"
    BUILD_ERRORS=$((BUILD_ERRORS + 1))
fi

# Only run the build if there are zero errors (warnings are OK for build)
if [ $BUILD_ERRORS -eq 0 ]; then
    # Run the standard npm build
    echo -e "\nBuilding obsidian-featured-image..."
    npm run build
    
    # Check if build was successful
    if [ $? -eq 0 ]; then
        echo "✅ Build completed successfully"
        
        # Verify output files exist
        echo -e "\nVerifying build output..."
        MISSING_FILES=""
        for file in "main.js" "manifest.json" "styles.css"; do
            if [ ! -f "$file" ]; then
                MISSING_FILES="$MISSING_FILES $file"
            fi
        done
        
        if [ -n "$MISSING_FILES" ]; then
            echo "⚠️  Warning: Expected output files missing:$MISSING_FILES"
            BUILD_WARNINGS=$((BUILD_WARNINGS + 1))
        else
            # Show file sizes
            echo "Build output:"
            ls -lh main.js manifest.json styles.css | awk '{print "  " $9 ": " $5}'
        fi
        
        # Check if local post-build script exists and run it
        if [ -f "$SCRIPT_DIR/build-local.sh" ]; then
            echo -e "\nRunning local post-build script..."
            "$SCRIPT_DIR/build-local.sh"
        fi
        
        # Summary
        echo -e "\n=== Build Summary ==="
        if [ $BUILD_WARNINGS -eq 0 ]; then
            echo "✅ Build successful"
            echo "✅ No warnings"
        else
            echo "✅ Build successful"
            echo "⚠️  $BUILD_WARNINGS warning(s) found"
        fi
        
        # Provide release instructions if clean build
        if [ $BUILD_WARNINGS -eq 0 ]; then
            echo -e "\n📦 Ready for release!"
            echo "   Files to include: main.js, manifest.json, styles.css"
            echo "   Create release: npm run release (if configured)"
        fi
    else
        echo "❌ Build failed"
        exit 1
    fi
else
    echo -e "\n=== Build Summary ==="
    if [ $BUILD_ERRORS -gt 0 ] && [ $BUILD_WARNINGS -gt 0 ]; then
        echo "❌ Build aborted due to $BUILD_ERRORS error(s) and $BUILD_WARNINGS warning(s)"
    elif [ $BUILD_ERRORS -gt 0 ]; then
        echo "❌ Build aborted due to $BUILD_ERRORS error(s)"
    else
        echo "❌ Build aborted due to $BUILD_WARNINGS warning(s)"
    fi
    echo -e "\nFix the errors above and run again:"
    echo "  ./scripts/build.sh"
    exit 1
fi