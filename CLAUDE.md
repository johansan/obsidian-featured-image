# Obsidian Featured Image Plugin

## Overview
This plugin automatically sets featured images for Obsidian markdown files based on their content. It detects the first image, YouTube link, or Auto Card Link image in a document and adds it to the frontmatter. The plugin supports image processing, cropping, resizing, and caching.

## Project Structure
```
- /Users/johan/Code/obsidian-featured-image/
  - LICENSE
  - README.md
  - esbuild.config.mjs         # Build configuration
  - images/                    # Documentation images
  - main.css                   # Main CSS styles
  - manifest.json              # Plugin manifest
  - package.json               # NPM package information
  - src/
    - main.ts                  # Core plugin logic
    - modals.ts                # Modal dialogs
    - settings.ts              # Plugin settings UI and definitions
  - styles.css                 # Additional styles
  - tsconfig.json              # TypeScript configuration
  - version-bump.mjs           # Version bumping script
  - versions.json              # Version tracking
```

## Key Components

### Settings
The plugin uses the following settings structure:
- `showNotificationsOnUpdate`: Show notifications when updates occur
- `excludedFolders`: Folders to exclude from processing
- `frontmatterProperty`: The frontmatter property to update (defaults to "feature")
- `mediaLinkFormat`: Format for the frontmatter property ('plain', 'wiki', or 'embed')
- `onlyUpdateExisting`: Only update if property already exists
- `keepEmptyProperty`: Keep property but set empty if no image found
- `preserveTemplateImages`: Preserve existing featured images if no new one found
- `thumbnailDownloadFolder`: Where to store downloaded images
- `cropAspectRatio`: Option to crop images to specific aspect ratios
- `resizeToWidth`: Option to resize images to specific width
- `imageExtensions`: Image file extensions to recognize

### Main Functionality
1. **Image Detection**: Scans documents for images, YouTube links, and Auto Card Link blocks
2. **Image Processing**: Crops and resizes images according to settings
3. **Source Tracking**: Stores original image paths in `{frontmatterProperty}-source` 
4. **Frontmatter Management**: Updates frontmatter with processed image paths

### Image Types Handled
- Local images (from vault)
- External downloaded images (from URLs)
- YouTube thumbnails

## Key Files and Their Purpose

### main.ts
Contains the core plugin logic including:
- Image detection
- Image processing with Sharp
- YouTube thumbnail downloading
- External image downloading
- Frontmatter management

### settings.ts
Contains settings UI and data structure:
- Setting definitions and defaults
- UI components for settings

### modals.ts
Contains modal dialogs for user confirmations

## Common Commands and Operations

### Build
```
npm run build
```

### Development
```
npm run dev
```

## Dependencies
- Sharp: Used for image processing (cropping and resizing)
- Obsidian API: For interfacing with the Obsidian app
- Crypto: For creating hashed filenames

## Source Tracking
The plugin uses a source tracking system to maintain relationships between original and processed images:
- The original path is stored in `{frontmatterProperty}-source`
- The processed path is stored in `{frontmatterProperty}`
- This allows reuse of processed images and proper detection of already processed images

## Developer Notes
- Debug mode can be enabled in settings
- Dry run mode prevents actual changes to files
- The plugin creates subfolders in the thumbnail folder for different image types (youtube, external, autocardlink, processed)