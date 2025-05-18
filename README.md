# Featured Image Plugin for Obsidian

## Table of Contents

- [Introduction](#introduction)
- [Key Features](#key-features)
- [Installation](#installation)
- [How to Use](#how-to-use)
  - [Basic Usage](#basic-usage)
  - [Using Bulk Update Commands](#using-bulk-update-commands)
  - [Creating Note Lists with Previews](#creating-note-lists-with-previews)
- [Settings](#settings)
- [Benefits and Optimizations](#benefits-and-optimizations)
- [Known Issues](#known-issues)
  - [Conflicts with Mousewheel Image Zoom Plugin](#conflicts-with-mousewheel-image-zoom-plugin)
- [Support and Feedback](#support-and-feedback)

## Introduction

Featured Image is a plugin for Obsidian that automatically sets a **featured image** property in the Frontmatter section of your notes based on the first image, YouTube link, or [Auto Card Link](https://github.com/nekoshita/obsidian-auto-card-link) image found in your document.

This allows you to create rich note lists similar to what you see in other popular note taking applications such as [Apple Notes](https://apps.apple.com/us/app/notes/id1110145109), [Evernote](https://evernote.com/) and [Bear](https://bear.app/).

https://github.com/user-attachments/assets/48be65f6-83b5-43f1-8e42-f82f08932b57

## Key Features

- Automatically updates the Frontmatter section in your notes with a featured image property
- Support for local images, external images, YouTube thumbnails, and Auto Card Link images
- Full support for Wiki image links with theme selectors and parameters (e.g., `![[image.jpg#right|caption|300]]`)
- Downloads and caches external images locally for offline access
- Create resized thumbnails of featured images with configurable dimensions
- Bulk update commands for processing all files or all documents in the current folder
- Cross-platform support for desktop and mobile
- Highly customizible (see [Settings](#settings))

## Installation

1. Open Obsidian and go to **Settings**
2. Navigate to "Community Plugins" and click "Browse"
3. Search for "Featured Image"
4. Click "Install" and then "Enable" to activate the plugin
5. Click "Options" to configure the plugin settings

If you enjoy using Featured Image, please consider [buying me a coffee](https://buymeacoffee.com/johansan).

<a href="https://www.buymeacoffee.com/johansan" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

## How to Use

### Basic Usage

1. Install the Featured Image plugin (see [Installation](#installation) section).
2. Make sure to review and adjust the [settings](#settings) to your liking.
3. Open a note containing an image, a YouTube link, or an Auto Card Link.
4. Change the contents of the note, for example add a new image, YouTube link, or Auto Card Link.
5. The plugin will automatically set the featured image property in the note's frontmatter.

### Using Bulk Update Commands

Featured Image provides several powerful commands to manage featured images across your entire vault:

1. **Set featured images in all files**
   - This command scans all markdown files in your vault, and sets or updates the featured image property based on the first image or YouTube link found in each file.
   - The original modification dates of your files are preserved.
   - To use:
     1. Open the Command Palette (Ctrl/Cmd + P)
     2. Search for "Featured Image: Set featured images in all files"
     3. Select the command and confirm the action in the modal that appears

2. **Set featured images in current folder**
   - This command scans all markdown files in the current folder and its subfolders, and sets or updates the featured image property based on the first image or YouTube link found in each file.
   - The original modification dates of your files are preserved.
   - To use:
     1. Open the Command Palette (Ctrl/Cmd + P)
     2. Search for "Featured Image: Set featured images in current folder"
     3. Select the command and confirm the action in the modal that appears

3. **Remove featured images from all files**
   - This command removes the featured image property from the frontmatter of all markdown files in your vault.
   - The original modification dates of your files are preserved.
   - To use:
     1. Open the Command Palette (Ctrl/Cmd + P)
     2. Search for "Featured Image: Remove featured images from all files"
     3. Select the command and confirm the action in the modal that appears

4. **Re-render all resized thumbnails**
   - This command regenerates all resized thumbnails based on your current settings (size, alignment, etc.).
   - Useful after changing thumbnail settings like alignment or dimensions.
   - To use:
     1. Open the Command Palette (Ctrl/Cmd + P)
     2. Search for "Featured Image: Re-render all resized thumbnails"
     3. Select the command and confirm the action in the modal that appears

![Set featured images in all files](images/bulk-update-1.png)

### Creating Note Lists with Previews

You can use Featured Image in combination with other plugins like [Dataview](https://blacksmithgu.github.io/obsidian-dataview/) and [Folder Notes](https://github.com/LostPaul/obsidian-folder-notes) to create beautiful lists of your notes:

1. Ensure your notes have featured images set.
2. Create a new note for your list, for example using the [Folder Notes plugin](https://github.com/LostPaul/obsidian-folder-notes).
3. Use [Dataview](https://blacksmithgu.github.io/obsidian-dataview/) to generate a list view of your notes, including the featured image as a preview.

If you're using the thumbnail resizing feature, you can reference the `featureResized` property (or your custom property name) in your queries for optimized previews:

Here is an example Dataview query for a list with previews that also shows the subfolders of your notes.
I have chosen to include a Frontmatter property called "foldernote" in my folder notes so they are not shown in the list.

```dataview
TABLE dateformat(file.ctime, "yyyy-MM-dd") AS "Date", regexreplace(file.folder, ".*\/([^\/]+)$", "$1") as "Folder", embed(link(feature)) as Image
FROM ""
WHERE contains(file.folder, this.file.folder)
WHERE file.name != this.file.name
WHERE !contains(foldernote, true)
SORT file.ctime DESC
```

If you have enabled the thumbnail resizing feature, you can use the following query to display optimized thumbnails instead:

```dataview
TABLE dateformat(file.ctime, "yyyy-MM-dd") AS "Date", regexreplace(file.folder, ".*\/([^\/]+)$", "$1") as "Folder", embed(link(featureResized)) as Thumbnail
FROM ""
WHERE contains(file.folder, this.file.folder)
WHERE file.name != this.file.name
WHERE !contains(foldernote, true)
SORT file.ctime DESC
```

![Dataview with previews](images/dataview.png)

## Settings

Here are the settings for the Featured Image plugin:

1. **Show Notifications**
   - Default: `false`
   - Description: When enabled, the plugin will show notifications when featured images are set, updated, or removed.
   - Usage: Enable this if you want to receive visual feedback when the plugin makes changes to your notes.

2. **Excluded Folders**
   - Default: `[]`
   - Description: List of folders to exclude from processing.
   - Usage: Add folder paths (e.g., `templates`, `archive`) to prevent the plugin from processing files in these locations. To add subfolders, use the full path (e.g., `templates/my-subfolder`).

3. **Frontmatter Property**
   - Default: `feature`
   - Description: The name of the frontmatter property used to store the featured image path.
   - Usage: Change this if you want to use a different property name in your frontmatter.

4. **Media Link Format**
   - Default: `plain`
   - Description: Choose how to format the featured image property in frontmatter:
     - `Plain text`: Stores the path as-is (e.g., `path/to/image.png`)
     - `Wiki link`: Stores the path as a wiki link (e.g., `[[path/to/image.png]]`)
     - `Embedded link`: Stores the path as an embedded link (e.g., `![[path/to/image.png]]`)
   - Usage: Choose the format that best suits your needs and workflow. Plain text is the most portable, while wiki and embedded links integrate better with Obsidian's linking system.

5. **Only Update if Frontmatter Property Exists**
   - Default: `false`
   - Description: When enabled, the plugin will only update notes that already have a featured image property.
   - Usage: Enable this if you want to manually control which notes have featured images.

6. **Keep Empty Property**
   - Default: `false`
   - Description: When enabled, the frontmatter property will be kept but set to an empty string if no featured image is found.
   - Usage: Enable this if you want to preserve the frontmatter property even when there's no featured image.

7. **Preserve Template Images**
   - Default: `false`
   - Description: When enabled, banner images set via templates will be retained even when the featured image is removed from the document.
   - Usage: Enable this if you use templates to set banner images and want to ensure they aren't affected by featured image updates.

8. **Require Exclamation Mark for YouTube Thumbnails**
   - Default: `true`
   - Description: When enabled, YouTube links must be prefixed with `!` to be considered for featured images.
   - Usage: Keep this enabled if you want more control over which YouTube links become featured images.

9. **Download WebP**
   - Default: `true`
   - Description: When enabled, the plugin will attempt to download WebP format thumbnails for YouTube videos.
   - Usage: Disable this if you prefer JPG thumbnails or if you're experiencing issues with WebP images.

10. **Thumbnail Download Folder**
    - Default: `thumbnails`
    - Description: The folder where external images, YouTube thumbnails, and Auto Card Link images will be downloaded and stored. To set a subfolder, use the full path (e.g., `_resources/thumbnails`).
    - Usage: Set this to your preferred location for storing downloaded images. The plugin will automatically create subfolders:
      - `youtube/` for YouTube thumbnails
      - `external/` for external images
      - `autocardlink/` for Auto Card Link external images

11. **Image Extensions**
    - Default: `["png", "jpg", "jpeg", "gif", "webp"]`
    - Description: List of image file extensions to consider when searching for featured images.
    - Usage: Add or remove extensions based on the image types you use in your vault.

12. **Create Resized Thumbnail**
    - Default: `false`
    - Description: When enabled, the plugin will create a resized version of the featured image and store its path in a separate frontmatter property.
    - Usage: Enable this to generate smaller, optimized versions of your featured images for faster loading in previews.

13. **Resized Thumbnail Frontmatter Property**
    - Default: `featureResized`
    - Description: The name of the frontmatter property used to store the resized thumbnail path.
    - Usage: Change this if you want to use a different property name for the resized thumbnail.

14. **Max Resized Width**
    - Default: `0` (no restriction)
    - Description: Maximum width in pixels for the resized thumbnail. Use 0 for no width restriction.
    - Usage: Set this to limit the width of generated resized thumbnails.

15. **Max Resized Height**
    - Default: `0` (no restriction)
    - Description: Maximum height in pixels for the resized thumbnail. Use 0 for no height restriction.
    - Usage: Set this to limit the height of generated resized thumbnails.

16. **Fill Resized Dimensions**
    - Default: `false`
    - Description: When enabled, resized thumbnails will be exactly the size specified by max width and height, maintaining aspect ratio and cropping to fill the dimensions.
    - Usage: Enable this if you want consistently sized thumbnails with the exact dimensions specified, cropped according to your alignment settings. Keep disabled to resize the image while maintaining the original aspect ratio without cropping.

17. **Resized Vertical Align**
    - Default: `top`
    - Description: Choose the vertical alignment (top, center, bottom) for cropped images when Fill Resized Dimensions is enabled.
    - Usage: This setting determines which part of the image is preserved when cropping vertically.

18. **Resized Horizontal Align**
    - Default: `center`
    - Description: Choose the horizontal alignment (left, center, right) for cropped images when Fill Resized Dimensions is enabled.
    - Usage: This setting determines which part of the image is preserved when cropping horizontally.

![Settings](images/settings.png)

## Benefits and Optimizations

Featured Image is designed with efficiency and performance in mind:

1. **Smart Caching**: The plugin utilizes Obsidian's built-in caching system to quickly access file metadata, minimizing the need for repeated file reads and improving processing speed.

2. **Optimized Document Scanning**: A combined regex is used to match various image formats, external URLs, YouTube links, and Auto Card Link images in a single pass, reducing the number of regex operations to just one, improving efficiency.

3. **Intelligent Image Handling**: 
   - For external images: Downloads and caches them locally for offline access
   - For YouTube links: Attempts to download WebP thumbnails first (if enabled), falling back to different types of JPG formats
   - For any featured image: Can create resized thumbnails with configurable dimensions for optimized previews
   This ensures the best quality images while minimizing bandwidth usage.

4. **Customizable Processing**: Exclude specific folders and choose to only update existing featured images, providing flexibility and further optimization based on individual needs.

## Known Issues

### Conflicts with Mousewheel Image Zoom Plugin

There is a known issue in the plugin "Mousewheel Image Zoom" when the same image name appears multiple times in a document. The following examples will not get resized:

1. When an image is mentioned in text and then used as a link:
   ```markdown
   Some text mentioning example.jpg in a paragraph
   Another paragraph

   ![[example.jpg|100]]  # This link would not get resized
   ```

2. When an image is used in frontmatter and then in the document:
   ```markdown
   ---
   feature: example.jpg
   ---
   ![[example.jpg|100]]  # This link would not get resized
   ```

#### Recommended Workaround
The "Image Converter" plugin offers similar functionality and has fixed this issue in version 1.2.20. Until the Mousewheel Image Zoom plugin is updated, we recommend:

1. Switch to using the "Image Converter" plugin
2. Ensure you're using version 1.2.20 or later of Image Converter

The author of Mousewheel Image Zoom has been notified of this issue, but no fix has been implemented yet.

## Support and Feedback

If you have any questions, suggestions, or issues, please open an issue on the [GitHub repository](https://github.com/johansan/obsidian-featured-image).

Enjoy using Featured Image!
