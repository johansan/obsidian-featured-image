# Featured Image Plugin for Obsidian

## Table of Contents
- [Introduction](#introduction)
- [Key Features](#key-features)
- [Benefits and Optimizations](#benefits-and-optimizations)
- [How to Use](#how-to-use)
  - [Basic Usage](#basic-usage)
  - [Creating Note Galleries](#creating-note-galleries)
  - [Creating Note Lists with Previews](#creating-note-lists-with-previews)
- [Settings](#settings)
- [Installation](#installation)
- [Support and Feedback](#support-and-feedback)

## Introduction

Featured Image is a powerful and highly optimized plugin for Obsidian that automatically sets a featured image property in your notes based on the first image or YouTube link in the document. This plugin enhances your note-taking experience by allowing you to create visually appealing galleries and lists of your notes with minimal effort.

[INSERT SCREENSHOT OR GIF DEMONSTRATING THE PLUGIN IN ACTION]

## Key Features

- Automatic frontmatter updates with featured image properties
- Support for both local images and YouTube thumbnails
- Bulk update commands for processing all documents at once
- Highly optimized for performance and low memory usage
- Cross-platform compatibility (desktop and mobile)
- Customizable settings to fit your workflow

## Benefits and Optimizations

Featured Image is designed with efficiency and performance in mind:

1. **Debounced Processing**: The plugin uses a debounce mechanism to prevent excessive processing when files are modified rapidly. This ensures that the plugin only runs when necessary, reducing CPU usage and improving overall performance.

2. **Smart Caching**: The plugin utilizes Obsidian's built-in caching system to quickly access file metadata, minimizing the need for repeated file reads and improving processing speed.

3. **Optimized Document Scanning**: A combined regex is used to match various image and YouTube link formats in a single pass, reducing the number of regex operations to just one, improving efficiency.

4. **Intelligent Thumbnail Handling**: For YouTube videos, the plugin attempts to download WebP thumbnails first (if enabled), falling back to different types of JPG formats. This ensures the best quality thumbnail while minimizing bandwidth usage.

5. **Customizable Processing**: Exclude specific folders and choose to only update existing featured images, providing flexibility and further optimization based on individual needs.

## How to Use

### Basic Usage

1. Install the Featured Image plugin (see [Installation](#installation) section).
2. Open a note containing an image or a YouTube link.
3. The plugin will automatically set the featured image property in the note's frontmatter.

[INSERT GIF SHOWING THE AUTOMATIC FRONTMATTER UPDATE]

### Creating Note Galleries

You can use Featured Image in combination with other plugins like Dataview to create beautiful galleries of your notes:

1. Ensure your notes have featured images set.
2. Create a new note for your gallery.
3. Use Dataview queries to generate a gallery view of your notes, utilizing the featured image property.

Example Dataview query for a gallery:

```dataview
TABLE WITHOUT ID
  ("![](" + featured-image + ")") as "Image",
  file.link as "Note"
FROM "YourFolderPath"
WHERE featured-image
SORT file.name ASC
```

[INSERT SCREENSHOT OF A GALLERY CREATED USING FEATURED IMAGE AND DATAVIEW]

### Creating Note Lists with Previews

You can also create lists of notes with image previews:

1. Ensure your notes have featured images set.
2. Create a new note for your list.
3. Use Dataview queries to generate a list view of your notes, including the featured image as a preview.

Example Dataview query for a list with previews:

```dataview
LIST WITHOUT ID
  "![](" + featured-image + ")" + " " + file.link
FROM "YourFolderPath"
WHERE featured-image
SORT file.name ASC
```

[INSERT SCREENSHOT OF A NOTE LIST WITH PREVIEWS]

## Settings

Featured Image offers several customizable settings to tailor the plugin to your needs:

1. **Frontmatter Property Name**
   - Default: `feature`
   - Description: The name of the frontmatter property used to store the featured image path.
   - Usage: Change this if you want to use a different property name in your frontmatter.

2. **YouTube Download Folder**
   - Default: `thumbnails`
   - Description: The folder where YouTube thumbnails will be downloaded and stored.
   - Usage: Set this to your preferred location for storing downloaded thumbnails.

3. **Image Extensions**
   - Default: `["png", "jpg", "jpeg", "gif", "webp"]`
   - Description: List of image file extensions to consider when searching for featured images.
   - Usage: Add or remove extensions based on the image types you use in your vault.

4. **Excluded Folders**
   - Default: `[]`
   - Description: List of folders to exclude from processing.
   - Usage: Add folder paths (e.g., `"templates"`, `"archive"`) to prevent the plugin from processing files in these locations.

5. **Only Update Existing**
   - Default: `false`
   - Description: When enabled, the plugin will only update notes that already have a featured image property.
   - Usage: Enable this if you want to manually control which notes have featured images.

6. **Require Exclamation for YouTube**
   - Default: `true`
   - Description: When enabled, YouTube links must be prefixed with `!` to be considered for featured images.
   - Usage: Enable this if you want more control over which YouTube links become featured images.

7. **Download WebP**
   - Default: `true`
   - Description: When enabled, the plugin will attempt to download WebP format thumbnails for YouTube videos.
   - Usage: Disable this if you prefer JPG thumbnails or if you're experiencing issues with WebP images.

[INSERT SCREENSHOT OF THE SETTINGS PAGE]

To access these settings:

1. Open Obsidian Settings
2. Navigate to "Community Plugins"
3. Find "Featured Image" in the list
4. Click on the gear icon to open the plugin settings

## Installation

1. Open Obsidian and go to Settings
2. Navigate to "Community Plugins" and click "Browse"
3. Search for "Featured Image"
4. Click "Install" and then "Enable" to activate the plugin

## Support and Feedback

If you encounter any issues or have suggestions for improving the Featured Image plugin, please visit our [GitHub repository](https://github.com/johansan/obsidian-featured-image) to submit an issue or contribute to the project.

If you enjoy using Featured Image or use it commercially, consider [buying me a coffee](https://buymeacoffee.com/johansan).

Enjoy using Featured Image to enhance your Obsidian experience!
