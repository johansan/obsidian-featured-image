# Featured Image Plugin for Obsidian

## Table of Contents
- [Introduction](#introduction)
- [Key Features](#key-features)
- [Benefits and Optimizations](#benefits-and-optimizations)
- [How to Use](#how-to-use)
  - [Basic Usage](#basic-usage)
  - [Using Bulk Update Commands](#using-bulk-update-commands)
  - [Creating Note Lists with Previews](#creating-note-lists-with-previews)
- [Installation](#installation)
- [Settings](#settings)
- [Support and Feedback](#support-and-feedback)

## Introduction

Featured Image is a powerful and highly optimized plugin for Obsidian that automatically sets a featured image property in your notes based on the first image, YouTube link, or [Auto Card Link](https://github.com/nekoshita/obsidian-auto-card-link) image in your document. This plugin enhances your note-taking experience by allowing you to create visually appealing galleries and lists of your notes with minimal effort.

https://github.com/user-attachments/assets/1533b079-b942-4abe-9366-eaccb24c796d

## Key Features

- Automatic frontmatter updates with featured image properties
- Support for local images, YouTube thumbnails, and Auto Card Link images
- Bulk update commands for processing all documents at once
- Highly optimized for performance and low memory usage
- Cross-platform compatibility (desktop and mobile)
- Customizable settings to fit your workflow

## Benefits and Optimizations

Featured Image is designed with efficiency and performance in mind:

1. **Debounced Processing**: The plugin uses a debounce mechanism to prevent excessive processing when files are modified rapidly. This ensures that the plugin only runs when necessary, reducing CPU usage and improving overall performance.

2. **Smart Caching**: The plugin utilizes Obsidian's built-in caching system to quickly access file metadata, minimizing the need for repeated file reads and improving processing speed.

3. **Optimized Document Scanning**: A combined regex is used to match various image formats, YouTube links, and Auto Card Link images in a single pass, reducing the number of regex operations to just one, improving efficiency.

4. **Intelligent Image Handling**: For YouTube links the plugin attempts to download WebP thumbnails first (if enabled), falling back to different types of JPG formats. This ensures the best quality thumbnail while minimizing bandwidth usage.

5. **Customizable Processing**: Exclude specific folders and choose to only update existing featured images, providing flexibility and further optimization based on individual needs.

## How to Use

### Basic Usage

1. Install the Featured Image plugin (see [Installation](#installation) section).
2. Make sure to review and adjust the [settings](#settings) to your liking.
3. Open a note containing an image, a YouTube link, or an Auto Card Link.
4. Change the contents of the note, for example add a new image, YouTube link, or Auto Card Link.
5. The plugin will automatically set the featured image property in the note's frontmatter.

### Using Bulk Update Commands

Featured Image provides two powerful bulk update commands to manage featured images across your entire vault:

1. **Set featured images in all files**
   - This command scans all markdown files in your vault and sets or updates the featured image property based on the first image or YouTube link found in each file.
   - To use:
     1. Open the Command Palette (Ctrl/Cmd + P)
     2. Search for "Featured Image: Set featured images in all files"
     3. Select the command and confirm the action in the modal that appears

2. **Remove featured images from all files**
   - This command removes the featured image property from the frontmatter of all markdown files in your vault.
   - To use:
     1. Open the Command Palette (Ctrl/Cmd + P)
     2. Search for "Featured Image: Remove featured images from all files"
     3. Select the command and confirm the action in the modal that appears

Note: These commands will update the modification date of processed files, which may affect sorting if you sort by modified date.

![Set featured images in all files](images/bulk-update-1.png)

### Creating Note Lists with Previews

You can use Featured Image in combination with other plugins like [Dataview](https://blacksmithgu.github.io/obsidian-dataview/) and [Folder Notes](https://github.com/LostPaul/obsidian-folder-notes) to create beautiful lists of your notes:

1. Ensure your notes have featured images set.
2. Create a new note for your list, for example using the [Folder Notes plugin](https://github.com/LostPaul/obsidian-folder-notes).
3. Use [Dataview](https://blacksmithgu.github.io/obsidian-dataview/) to generate a list view of your notes, including the featured image as a preview.

Example Dataview query for a list with previews:

```dataview
TABLE dateformat(file.ctime, "yyyy-MM-dd") AS "Date", embed(link(feature)) as Image
FROM ""
WHERE contains(file.folder, this.file.folder)
WHERE file.name != this.file.name
SORT file.ctime DESC
```

[INSERT SCREENSHOT OF A NOTE LIST WITH PREVIEWS]

## Installation

1. Open Obsidian and go to Settings
2. Navigate to "Community Plugins" and click "Browse"
3. Search for "Featured Image"
4. Click "Install" and then "Enable" to activate the plugin
5. Click "Options" to configure the plugin settings

## Settings

Featured Image offers several customizable settings to tailor the plugin to your needs:

1. **Show Notifications**
   - Default: `false`
   - Description: When enabled, the plugin will show notifications when featured images are set, updated, or removed.
   - Usage: Enable this if you want to receive visual feedback when the plugin makes changes to your notes.

2. **Excluded Folders**
   - Default: `[]`
   - Description: List of folders to exclude from processing.
   - Usage: Add folder paths (e.g., `"templates"`, `"archive"`) to prevent the plugin from processing files in these locations.

3. **Frontmatter Property Name**
   - Default: `feature`
   - Description: The name of the frontmatter property used to store the featured image path.
   - Usage: Change this if you want to use a different property name in your frontmatter.

4. **Only Update if frontmatter property exists**
   - Default: `false`
   - Description: When enabled, the plugin will only update notes that already have a featured image property.
   - Usage: Enable this if you want to manually control which notes have featured images.

5. **Require Exclamation mark for YouTube thumbnails**
   - Default: `true`
   - Description: When enabled, YouTube links must be prefixed with `!` to be considered for featured images.
   - Usage: Keep this enabled if you want more control over which YouTube links become featured images.

6. **Download WebP**
   - Default: `true`
   - Description: When enabled, the plugin will attempt to download WebP format thumbnails for YouTube videos.
   - Usage: Disable this if you prefer JPG thumbnails or if you're experiencing issues with WebP images.

7. **YouTube Download Folder**
   - Default: `thumbnails`
   - Description: The folder where YouTube thumbnails will be downloaded and stored.
   - Usage: Set this to your preferred location for storing downloaded thumbnails. You can use subfolders like "resources/thumbnails" to keep your vault organized.

8. **Image Extensions**
   - Default: `["png", "jpg", "jpeg", "gif", "webp"]`
   - Description: List of image file extensions to consider when searching for featured images.
   - Usage: Add or remove extensions based on the image types you use in your vault.

![Settings](images/settings.png)

## Support and Feedback

If you enjoy using Featured Image or use it commercially, consider [buying me a coffee](https://buymeacoffee.com/johansan).

If you have any questions, suggestions, or issues, please open an issue on the [GitHub repository](https://github.com/johansan/obsidian-featured-image).

Enjoy using Featured Image to enhance your Obsidian experience!
