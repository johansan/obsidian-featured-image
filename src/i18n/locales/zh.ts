/**
 * Chinese language strings for Featured Image
 */
export const STRINGS_ZH = {
    // Commands
    commands: {
        updateAll: '在所有文件中设置特色图片属性（添加或更新）',
        updateAllNoThumbnail: '在所有文件中设置特色图片（添加或更新）',
        updateFolder: '在当前文件夹中设置特色图片属性（添加或更新）',
        updateFolderNoThumbnail: '在当前文件夹中设置特色图片（添加或更新）',
        removeAll: '从所有文件中删除特色图片属性',
        removeAllNoThumbnail: '从所有文件中删除特色图片',
        cleanupUnused: '删除未使用的下载图片和缩略图',
        rerenderThumbnails: '重新渲染所有调整大小的缩略图'
    },

    // Settings
    settings: {
        headings: {
            advanced: '高级',
            externalMedia: '外部媒体'
        },

        items: {
            showNotifications: {
                name: '显示通知',
                desc: '当特色图片被设置、更新或删除时显示通知。'
            },
            frontmatterProperty: {
                name: 'Frontmatter 属性',
                desc: '用特色图片更新的 frontmatter 属性名称'
            },
            thumbnailsFolder: {
                name: '缩略图文件夹',
                desc: '用于下载的缩略图和调整大小的图片的文件夹。将自动为不同的图片类型创建子文件夹。'
            },
            excludedFolders: {
                name: '排除的文件夹',
                desc: '要从特色图片插件中排除的文件夹的逗号分隔列表。'
            },
            resizeFeatureImage: {
                name: '调整特色图片大小',
                desc: '调整特色图片大小以获得更好的滚动列表或 Notebook Navigator 等插件的性能。'
            },
            resizedThumbnailProperty: {
                name: '调整大小的缩略图属性名称',
                desc: '用于存储调整大小的缩略图路径的 frontmatter 属性名称。',
                placeholder: 'thumbnail'
            },
            maxResizedWidth: {
                name: '最大调整宽度',
                desc: '调整大小的缩略图的最大宽度（像素）。使用 0 表示无宽度限制。',
                placeholder: '128'
            },
            maxResizedHeight: {
                name: '最大调整高度',
                desc: '调整大小的缩略图的最大高度（像素）。使用 0 表示无高度限制。',
                placeholder: '128'
            },
            fillResizedDimensions: {
                name: '填充调整后的尺寸',
                desc: '启用后，调整大小的缩略图将完全符合最大宽度和高度指定的大小，保持纵横比并裁剪以填充尺寸。'
            },
            verticalAlignment: {
                name: '垂直对齐',
                desc: '选择裁剪图片的垂直对齐方式。',
                options: {
                    top: '顶部',
                    center: '中心',
                    bottom: '底部'
                }
            },
            horizontalAlignment: {
                name: '水平对齐',
                desc: '选择裁剪图片的水平对齐方式。',
                options: {
                    left: '左',
                    center: '中心',
                    right: '右'
                }
            },
            showAdvancedSettings: {
                name: '显示高级设置',
                desc: '切换以显示或隐藏高级配置选项'
            },
            mediaLinkFormat: {
                name: '媒体链接格式',
                desc: '选择如何在 frontmatter 中格式化特色图片属性。'
            },
            onlyUpdateExisting: {
                name: '仅在 frontmatter 属性存在时更新',
                desc: '启用此选项以仅在 frontmatter 属性已存在时更新它。'
            },
            keepEmptyProperty: {
                name: '保留空属性',
                desc: '启用后，如果找不到特色图片，frontmatter 属性将被保留但设置为空字符串。禁用后，属性将被删除。'
            },
            preserveTemplateImages: {
                name: '不清除现有属性',
                desc: '启用后，如果在文档中找不到图片，则保留现有的特色图片属性。禁用后，当未检测到图片时清除或删除属性（取决于"保留空属性"设置）。'
            },
            requireExclamationForYouTube: {
                name: 'YouTube 缩略图需要感叹号',
                desc: '如果启用，只有带有感叹号前缀的 YouTube 链接才会被考虑用于缩略图下载。'
            },
            downloadWebP: {
                name: '下载 WebP',
                desc: '如果可用，从 YouTube 下载 WebP 版本的图片，否则下载 JPG。'
            },
            downloadExternalImages: {
                name: '将外部图片下载到缩略图文件夹',
                desc: '将外部图片链接存储在本地。禁用后，在选择特色图片时跳过远程图片。'
            },
            downloadYoutubeThumbnails: {
                name: '下载 YouTube 缩略图',
                desc: '将 YouTube 缩略图存储在本地。禁用后，在选择特色图片时跳过 YouTube 链接。'
            },
            localImageExtensions: {
                name: '本地图片扩展名',
                desc: '要在文档中搜索的图片文件扩展名的逗号分隔列表。',
                placeholder: 'png,jpg,jpeg,gif,webp'
            },
            debugMode: {
                name: '调试模式',
                desc: '启用调试模式以在控制台中记录详细信息。'
            },
            dryRun: {
                name: '试运行',
                desc: '启用试运行以防止对文件进行任何更改。'
            }
        },

        info: {
            rerenderTip: '提示：更改对齐或尺寸设置后，从命令面板运行"重新渲染所有调整大小的缩略图"命令，以使用新设置更新现有缩略图。'
        }
    },

    // Notices
    notices: {
        updatingAllFiles: '正在更新所有文件中的特色图片...',
        updatingFolder: '正在更新当前文件夹中的特色图片...',
        removingAllImages: '正在从所有文件中删除特色图片...',
        cleaningUpUnused: '正在清理未使用的图片...',
        rerenderingThumbnails: '正在重新渲染所有缩略图...',
        completed: '已完成',
        noActiveFile: '没有活动文件',
        errorOccurred: '发生错误',
        featureSet: '特色图片已设置',
        featureUpdated: '特色图片已更新',
        featureRemoved: '特色图片已删除',
        featureUnchanged: '特色图片未更改',
        dryRunEnabled: '试运行已启用 - 未进行任何更改',
        filesProcessed: '已处理 {count} 个文件',
        imagesDeleted: '已删除 {count} 个图片',
        thumbnailsRerendered: '已重新渲染 {count} 个缩略图'
    }
};
