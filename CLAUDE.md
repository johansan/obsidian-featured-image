# CLAUDE instructions v1.7 Generic

## Building

- ALWAYS run `./scripts/build.sh` when finished making code changes
- The build MUST complete with ZERO errors and ZERO warnings
- If the build shows ANY errors or warnings, you MUST fix them immediately
- Do NOT accept or ignore any ESLint errors, TypeScript errors, unused imports,
  or dead code warnings
- The build summary must show "✅ No warnings" - anything else is unacceptable
- ALWAYS try to avoid eslint-ignore comments, try to find the actual problem and
  fix it properly instead of patching with ignore comments
- IMPORTANT: The build will NOT deploy if there are ANY warnings or errors - the
  deployment will be aborted

```bash
# Build (use this instead of npm run build)
./scripts/build.sh
```

## Version Management

- NEVER modify version numbers in `manifest.json`, `package.json`, or
  `versions.json`
- These files are automatically updated by the release script
  `scripts/release.js`
- Only update version information in `src/releaseNotes.ts` when adding release
  notes

## Code structure - IMPORTANT

When creating new classes or adding imports, member variables and functions,
ALWAYS follow the following structure:

### Functional Components:

// Imports import React, { useState, useEffect } from 'react';

// Types/Interfaces interface Props { ... }

// Component export function ComponentName({ prop1, prop2 }: Props) { // Hooks
(state, context, refs) const [state, setState] = useState(); const context =
useContext(); const ref = useRef();

    // Derived state / memoized values
    const computed = useMemo(() => ..., []);

    // Callbacks / handlers
    const handleClick = useCallback(() => ..., []);

    // Effects (at bottom)
    useEffect(() => ..., []);

    // Render
    return <div>...</div>;

}

### Key Rules:

- Hooks first - All hooks at the top
- Logic in middle - Computed values, handlers
- Effects at bottom - Just before return
- Early returns - Guard clauses before main render
- Extract complex logic - Use custom hooks for reusability

## Type Guards for Obsidian

Always use type guards for Obsidian types:

```typescript
// GOOD
function isFolder(file: TAbstractFile): file is TFolder {
  return file instanceof TFolder;
}

// BAD - Never use type assertions
const folder = file as TFolder;
```

## Important Instructions

### SOFTWARE DESIGN

- ALWAYS use simple and clean architectural solutions
- ALWAYS consider best architectural practices. Example: do NOT implement direct
  file reads in render. Use memory cache for synchronous data access.

### FIXING ISSUES

- NEVER try to fix the issue by patching existing code, instead
- ALWAYS work to find the underlying reason for the issue
- ALWAYS doubt the quality of the code, and do not be afraid to change things to
  make things better
- NEVER edit code to fix an issue if you are not absolutely certain what causes
  it

### COMMENTING POLICY

- Comment what the code does and how to use it; do not describe change history or "what we changed"
- Avoid migration/patch notes in code; put rationale in docs if needed

## Writing Style Guide - CRITICAL

### Core Principle: Features Speak for Themselves
- Write WHAT features do, NOT WHY they're good or beneficial
- Trust readers to understand implications without explanation
- Avoid redundant qualifiers, justifications, and benefit statements

### Feature Descriptions

**BAD - Never write like this:**
- "Touch-friendly interface with properly sized buttons for better one-handed navigation"
- "Tag first interface - Display tags above or below folders to match your own style"
- "Efficient caching system for improved performance and faster load times"
- "Customizable colors to personalize your experience"
- "Smart folder expansion for easier navigation"
- "Optimized search to quickly find your files"

**GOOD - Always write like this:**
- "Touch-friendly interface with properly sized buttons and optimized header layouts"
- "Tag first interface - Display tags above or below folders"
- "Efficient caching system using IndexedDB and memory mirror"
- "Customizable colors for folders and tags"
- "Automatic folder expansion when revealing files"
- "Full-text search with tag and folder filtering"

### Rules for All Writing

1. **Remove benefit phrases**: "for better", "to improve", "for easier", "to enhance", "allows you to", "enables", "helps you"
2. **Remove personal phrases**: "to match your style", "personalize your", "your own", "tailored to you"
3. **Remove performance claims**: "faster", "quicker", "more efficient" (unless stating measurable facts)
4. **Remove subjective adjectives**: "smart", "powerful", "seamless", "intuitive", "elegant"
5. **State facts only**: Describe what exists, not why it's good

### Code Comments

**BAD:**
```typescript
// This cache improves performance by storing data in memory for faster access
// Smart algorithm to efficiently find the best match
// Elegant solution for handling edge cases smoothly
```

**GOOD:**
```typescript
// Stores vault data in memory, mirroring IndexedDB
// Finds first matching file by name and path
// Handles null values and empty arrays
```

### Documentation Examples

**BAD:**
"The plugin features a powerful two-pane interface that allows you to efficiently navigate your vault with an intuitive folder tree on the left and a detailed file list on the right, making it easy to find and organize your notes."

**GOOD:**
"Two-pane interface with folder/tag tree on the left and file list on the right."

### UI Text
- Use sentence case
- State the action or feature name only
- No explanatory suffixes

**BAD:** "Enable Auto-reveal (automatically shows current file location)"
**GOOD:** "Enable auto-reveal"

### NEVER use these patterns:
- "X for Y" (feature for benefit)
- "X to Y" (feature to achieve)
- "X that allows/enables Y"
- "X so you can Y"
- Any form of selling or persuasion
- Any explanation of why something is useful

### ALWAYS

- ALWAYS use type guards instead of assertions for Obsidian types
- ALWAYS use `fileManager.trashFile()` not `vault.delete()`
- ALWAYS define static styles in CSS files, not inline
  - Exception: Dynamic user-selected values (e.g., colors in ColorPickerModal) are appropriate as inline styles
  - Use `element.style.backgroundColor = userColor` for runtime dynamic values
  - Use CSS files for all static styling, themes, and predefined appearances
- ALWAYS use sentence case for UI text
- ALWAYS use the mobileLogger class to log on mobile, mobile devices do not
  support console
- ALWAYS add debug logging to understand issues instead of applying fixes for
  testing

### NEVER

- NEVER use type assertions (as) for Obsidian types
- NEVER use `any` or `unknown` types
- NEVER assume a problem is fixed unless user has tested that it works first
- NEVER assume you know the solution to a problem without reading logs
- NEVER apply a bug fix unless I have explicitly approved it. If you are unsure,
  add debug logs
- NEVER add comments describing the changes you did. Comments should only
  describe what code the does
- NEVER remove debug logs because you think an issue is resolved until I have
  explicitly approved the solution
- NEVER keep deprecated code for backwards compatibility - remove it immediately
- NEVER add unnecessary fallbacks "just in case" - if parameters are required,
  make them required in TypeScript. The compiler will enforce correct usage
