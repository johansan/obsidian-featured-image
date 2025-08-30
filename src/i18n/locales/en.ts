/**
 * English language strings for Featured Image
 */
export const STRINGS_EN = {
    // Commands
    commands: {
        updateAll: 'Set feature properties in all files (add or update)',
        updateAllNoThumbnail: 'Set featured images in all files (add or update)',
        updateFolder: 'Set feature properties in current folder (add or update)',
        updateFolderNoThumbnail: 'Set featured images in current folder (add or update)',
        removeAll: 'Remove feature properties in all files',
        removeAllNoThumbnail: 'Remove featured images in all files',
        cleanupUnused: 'Remove unused downloaded images and thumbnails',
        rerenderThumbnails: 'Re-render all resized thumbnails'
    },

    // Settings
    settings: {
        headings: {
            advanced: 'Advanced'
        },

        items: {
            showNotifications: {
                name: 'Show notifications',
                desc: 'Show notifications when the featured image is set, updated or removed.'
            },
            frontmatterProperty: {
                name: 'Frontmatter property',
                desc: 'The name of the frontmatter property to update with the featured image'
            },
            thumbnailsFolder: {
                name: 'Thumbnails folder',
                desc: 'Folder for downloaded thumbnails and resized images. Subfolders will be created automatically for different image types.'
            },
            excludedFolders: {
                name: 'Excluded folders',
                desc: 'Comma separated list of folders to exclude from the featured image plugin.'
            },
            resizeFeatureImage: {
                name: 'Resize feature image',
                desc: 'Resize feature image for better performance in scrolling lists or plugins like Notebook Navigator.'
            },
            resizedThumbnailProperty: {
                name: 'Resized thumbnail property name',
                desc: 'The name of the frontmatter property to store the resized thumbnail path.',
                placeholder: 'thumbnail'
            },
            maxResizedWidth: {
                name: 'Max resized width',
                desc: 'Maximum width of the resized thumbnail in pixels. Use 0 for no width restriction.',
                placeholder: '128'
            },
            maxResizedHeight: {
                name: 'Max resized height',
                desc: 'Maximum height of the resized thumbnail in pixels. Use 0 for no height restriction.',
                placeholder: '128'
            },
            fillResizedDimensions: {
                name: 'Fill resized dimensions',
                desc: 'When enabled, resized thumbnails will be exactly the size specified by max width and height, maintaining aspect ratio and cropping to fill the dimensions.'
            },
            verticalAlignment: {
                name: 'Vertical alignment',
                desc: 'Choose the vertical alignment for cropped images.',
                options: {
                    top: 'Top',
                    center: 'Center',
                    bottom: 'Bottom'
                }
            },
            horizontalAlignment: {
                name: 'Horizontal alignment',
                desc: 'Choose the horizontal alignment for cropped images.',
                options: {
                    left: 'Left',
                    center: 'Center',
                    right: 'Right'
                }
            },
            showAdvancedSettings: {
                name: 'Show advanced settings',
                desc: 'Toggle to show or hide advanced configuration options'
            },
            mediaLinkFormat: {
                name: 'Media link format',
                desc: 'Choose how to format the featured image property in frontmatter.'
            },
            onlyUpdateExisting: {
                name: 'Only update if frontmatter property exists',
                desc: 'Enable this to only update the frontmatter property if it already exists.'
            },
            keepEmptyProperty: {
                name: 'Keep empty property',
                desc: 'When enabled, the frontmatter property will be kept but set to an empty string if no featured image is found. When disabled, the property will be removed.'
            },
            preserveTemplateImages: {
                name: "Don't clear existing property",
                desc: "When enabled, keeps the existing featured image property if no image is found in the document. When disabled, clears or removes the property when no image is detected (depending on the 'Keep empty property' setting)."
            },
            requireExclamationForYouTube: {
                name: 'Require exclamation mark for YouTube thumbnails',
                desc: 'If enabled, only YouTube links prefixed with an exclamation mark will be considered for thumbnail download.'
            },
            downloadWebP: {
                name: 'Download WebP',
                desc: 'Download WebP versions of images from YouTube if available, otherwise download JPG.'
            },
            localImageExtensions: {
                name: 'Local image extensions',
                desc: 'Comma-separated list of image file extensions to search for in documents.',
                placeholder: 'png,jpg,jpeg,gif,webp'
            },
            debugMode: {
                name: 'Debug mode',
                desc: 'Enable debug mode to log detailed information to the console.'
            },
            dryRun: {
                name: 'Dry run',
                desc: 'Enable dry run to prevent any changes from being made to your files.'
            }
        },

        info: {
            rerenderTip:
                'Tip: After changing alignment or dimension settings, run the command "Re-render all resized thumbnails" from the command palette to update existing thumbnails with the new settings.'
        }
    },

    // Notices
    notices: {
        updatingAllFiles: 'Updating featured images in all files...',
        updatingFolder: 'Updating featured images in current folder...',
        removingAllImages: 'Removing featured images from all files...',
        cleaningUpUnused: 'Cleaning up unused images...',
        rerenderingThumbnails: 'Re-rendering all thumbnails...',
        completed: 'Completed',
        noActiveFile: 'No active file',
        errorOccurred: 'An error occurred',
        featureSet: 'Feature image set',
        featureUpdated: 'Feature image updated',
        featureRemoved: 'Feature image removed',
        featureUnchanged: 'Feature image unchanged',
        dryRunEnabled: 'Dry run enabled - no changes made',
        filesProcessed: '{count} files processed',
        imagesDeleted: '{count} images deleted',
        thumbnailsRerendered: '{count} thumbnails re-rendered'
    }
};
