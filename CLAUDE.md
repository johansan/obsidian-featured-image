# Obsidian Featured Image Plugin - CLAUDE.md

## Project Summary

Featured Image is an Obsidian plugin that automatically sets featured image properties in note frontmatter. It detects the first image in a note (local, YouTube, or external) and updates the frontmatter accordingly. The plugin supports bulk operations, thumbnail generation, and automatic image downloading.

## Core Features
- **Automatic Featured Image Detection**: Sets frontmatter property based on first image found
- **Multiple Image Sources**: Wiki links (`![[image.jpg]]`), markdown links, YouTube videos, external URLs, and Auto Card Link blocks
- **Thumbnail Generation**: Creates resized versions with configurable dimensions and alignment
- **Bulk Operations**: Process entire vault or folders with progress tracking
- **Smart Downloading**: Caches external images and YouTube thumbnails locally
- **Image Management**: Cleanup commands for unused downloaded images

## Quick Start for AI Assistants
- **Main Entry Point**: `src/main.ts` (`FeaturedImage` class)
- **Settings**: `src/settings.ts` (configuration and UI)
- **Build Command**: `npm run build`
- **Dev Mode**: `npm run dev`
- **Release Assets**: `main.js`, `manifest.json`, `styles.css`
- **Key Patterns**: Single main class, regex-based image detection, Canvas API for thumbnails
- **Testing**: Manual testing within an Obsidian vault

## Architecture Overview

### Directory Structure
```
obsidian-featured-image/
├── src/
│   ├── main.ts          # Core plugin logic, image processing, file monitoring
│   ├── settings.ts      # Settings interface, defaults, configuration UI
│   └── modals.ts        # Confirmation modal for bulk operations
├── styles.css           # Plugin styles
├── manifest.json        # Plugin metadata
└── package.json         # Dependencies (mainly build tools)
```

### Core Components

#### FeaturedImage Class (main.ts)
The main plugin class handles:
- **Image Detection**: Pre-compiled regex patterns for various image formats
- **Download Queue**: Manages external image and YouTube thumbnail downloads
- **Thumbnail Generation**: Canvas-based resizing with configurable dimensions
- **File Monitoring**: Watches for metadata changes to update featured images
- **Bulk Processing**: Batch operations with progress notifications

Key methods:
- `updateFeaturedImage()`: Core logic for detecting and setting featured images
- `downloadExternalImage()`: Downloads and caches external images
- `createResizedImage()`: Generates thumbnails using Canvas API
- `cleanupDownloadedImages()`: Removes unused cached images

#### Settings (settings.ts)
- `FeaturedImageSettings`: TypeScript interface for all settings
- `DEFAULT_SETTINGS`: Default configuration values
- `FeaturedImageSettingTab`: Settings UI with dynamic controls

### Image Detection Patterns

The plugin uses optimized regex patterns to detect:
1. **Wiki-style images**: `![[image.jpg]]` with full parameter support
2. **Markdown images**: `![alt](path/to/image.jpg)`
3. **YouTube videos**: Various YouTube URL formats
4. **External images**: HTTPS URLs to image files
5. **Auto Card Link**: Special code block format

### File Organization

Downloaded content is organized in `.obsidian/plugins/featured-image/`:
```
thumbnails/
├── youtube/         # YouTube thumbnails (hash-based names)
├── external/        # Downloaded external images
├── autocardlink/    # Auto Card Link images
└── resized/         # Generated thumbnail versions
```

## Code Style & Patterns

### TypeScript Conventions
- **Strict Mode**: Enforced via tsconfig.json
- **Type Safety**: No unsafe `as` casting for Obsidian types
- **Error Handling**: Try-catch blocks with user notifications

### Performance Optimizations
- **Pre-compiled Regex**: Patterns compiled once at startup
- **Batch Processing**: Files processed in groups of 5
- **Debouncing**: Prevents rapid successive updates
- **Early Returns**: Skip processing when no changes needed

### State Management
- `bulkUpdateInProgress`: Prevents concurrent bulk operations
- `filesBeingUpdated`: Set to track files currently being processed
- `lastProcessedContent`: Map to detect actual content changes

## Obsidian Plugin Requirements

### Type Safety
Per Obsidian guidelines, avoid type assertions:
```typescript
// ❌ Bad
const file = abstractFile as TFile;

// ✅ Good
if (abstractFile instanceof TFile) {
    // abstractFile is now safely typed as TFile
}
```

### File Deletion
Use `fileManager.trashFile()` instead of `vault.delete()`:
```typescript
// ❌ Bad
await this.app.vault.delete(file);

// ✅ Good
await this.app.fileManager.trashFile(file);
```

### Styling
Avoid inline styles - use CSS classes:
```typescript
// ❌ Bad
element.style.backgroundColor = '#dc3545';

// ✅ Good
element.addClass('featured-image-error');
```

## Common Development Tasks

### Add a New Setting
1. Update `FeaturedImageSettings` interface in `settings.ts`
2. Add default value to `DEFAULT_SETTINGS`
3. Add UI control in `FeaturedImageSettingTab.display()`
4. Use setting in `main.ts` via `this.settings.propertyName`

### Add a New Image Source
1. Add detection regex to `initializeRegexPatterns()` in `main.ts`
2. Update `updateFeaturedImage()` to handle the new format
3. Add download logic if needed (see `downloadExternalImage()`)
4. Update settings descriptions to mention the new source

### Modify Thumbnail Generation
1. Edit `createResizedImage()` method in `main.ts`
2. Canvas operations use standard HTML5 Canvas API
3. Test with various image formats and sizes

### Add a New Bulk Command
1. Add command in `onload()` method
2. Create handler method (follow pattern of `setFeaturedImagesInFolder()`)
3. Use `Notice` for progress updates
4. Set `bulkUpdateInProgress` flag during operation

## Build & Development

```bash
# Install dependencies
npm install

# Development build with watch mode
npm run dev

# Production build
npm run build

# Version bump (updates manifest and versions.json)
npm version patch
```

The plugin uses esbuild for fast compilation. Output files:
- `main.js`: Compiled plugin code
- `styles.css`: Plugin styles (currently minimal)
- `manifest.json`: Plugin metadata (not generated, manually maintained)

## Testing Checklist

When making changes, test:
1. **Image Detection**: All supported formats (wiki, markdown, YouTube, external)
2. **Bulk Operations**: Small folder, large vault, cancellation
3. **Thumbnail Generation**: Different sizes, alignments, formats
4. **Edge Cases**: No images, multiple images, invalid URLs
5. **Performance**: Large files, many images, rapid changes
6. **Settings**: All options work as expected
7. **File Watching**: Auto-updates on file changes

## Debug Mode

Enable debug mode in settings for detailed console logging:
- Image detection results
- Download progress
- Thumbnail generation details
- Performance metrics

Logs are prefixed with `[Featured Image]` for easy filtering.