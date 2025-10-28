/**
 * Japanese language strings for Featured Image
 */
export const STRINGS_JA = {
    // Commands
    commands: {
        updateAll: 'すべてのファイルにアイキャッチ画像プロパティを設定（追加または更新）',
        updateAllNoThumbnail: 'すべてのファイルにアイキャッチ画像を設定（追加または更新）',
        updateFolder: '現在のフォルダにアイキャッチ画像プロパティを設定（追加または更新）',
        updateFolderNoThumbnail: '現在のフォルダにアイキャッチ画像を設定（追加または更新）',
        removeAll: 'すべてのファイルからアイキャッチ画像プロパティを削除',
        removeAllNoThumbnail: 'すべてのファイルからアイキャッチ画像を削除',
        cleanupUnused: '未使用のダウンロード画像とサムネイルを削除',
        rerenderThumbnails: 'すべてのリサイズされたサムネイルを再レンダリング'
    },

    // Settings
    settings: {
        headings: {
            advanced: '詳細設定',
            localMedia: 'ローカルメディア',
            externalMedia: '外部メディア',
            notebookNavigator: 'Notebook Navigator'
        },

        items: {
            showNotifications: {
                name: '通知を表示',
                desc: 'アイキャッチ画像が設定、更新、削除されたときに通知を表示します。'
            },
            frontmatterProperty: {
                name: 'フロントマタープロパティ',
                desc: 'アイキャッチ画像で更新するフロントマタープロパティの名前'
            },
            thumbnailsFolder: {
                name: 'サムネイルフォルダ',
                desc: 'ダウンロードしたサムネイルとリサイズした画像用のフォルダ。異なる画像タイプ用のサブフォルダが自動的に作成されます。'
            },
            excludedFolders: {
                name: '除外フォルダ',
                desc: 'アイキャッチ画像プラグインから除外するフォルダのカンマ区切りリスト。'
            },
            resizeFeatureImage: {
                name: 'アイキャッチ画像をリサイズ',
                desc: 'スクロールリストやNotebook Navigatorなどのプラグインでのパフォーマンス向上のため、アイキャッチ画像をリサイズします。'
            },
            resizedThumbnailProperty: {
                name: 'リサイズされたサムネイルプロパティ名',
                desc: 'リサイズされたサムネイルパスを保存するフロントマタープロパティの名前。',
                placeholder: 'thumbnail'
            },
            maxResizedWidth: {
                name: '最大リサイズ幅',
                desc: 'リサイズされたサムネイルの最大幅（ピクセル）。幅制限なしの場合は0を使用。',
                placeholder: '256'
            },
            maxResizedHeight: {
                name: '最大リサイズ高さ',
                desc: 'リサイズされたサムネイルの最大高さ（ピクセル）。高さ制限なしの場合は0を使用。',
                placeholder: '144'
            },
            fillResizedDimensions: {
                name: 'リサイズ寸法を満たす',
                desc: '有効にすると、リサイズされたサムネイルは最大幅と高さで指定されたサイズになり、アスペクト比を維持し、寸法を満たすようにトリミングされます。'
            },
            verticalAlignment: {
                name: '垂直方向の配置',
                desc: 'トリミングされた画像の垂直方向の配置を選択します。',
                options: {
                    top: '上',
                    center: '中央',
                    bottom: '下'
                }
            },
            horizontalAlignment: {
                name: '水平方向の配置',
                desc: 'トリミングされた画像の水平方向の配置を選択します。',
                options: {
                    left: '左',
                    center: '中央',
                    right: '右'
                }
            },
            showAdvancedSettings: {
                name: '詳細設定を表示',
                desc: '詳細な設定オプションの表示/非表示を切り替え'
            },
            mediaLinkFormat: {
                name: 'メディアリンク形式',
                desc: 'フロントマターでアイキャッチ画像プロパティをフォーマットする方法を選択します。'
            },
            onlyUpdateExisting: {
                name: 'フロントマタープロパティが存在する場合のみ更新',
                desc: 'これを有効にすると、フロントマタープロパティが既に存在する場合のみ更新されます。'
            },
            keepEmptyProperty: {
                name: '空のプロパティを保持',
                desc: '有効にすると、アイキャッチ画像が見つからない場合、フロントマタープロパティは保持されますが空の文字列に設定されます。無効にすると、プロパティは削除されます。'
            },
            preserveTemplateImages: {
                name: '既存のプロパティをクリアしない',
                desc: '有効にすると、ドキュメントに画像が見つからない場合、既存のアイキャッチ画像プロパティを保持します。無効にすると、画像が検出されない場合、プロパティをクリアまたは削除します（「空のプロパティを保持」設定に依存）。'
            },
            requireExclamationForYouTube: {
                name: 'YouTubeサムネイルに感嘆符が必要',
                desc: '有効にすると、感嘆符が前に付いたYouTubeリンクのみがサムネイルダウンロードの対象となります。'
            },
            downloadExternalImages: {
                name: '外部画像をサムネイルフォルダにダウンロード',
                desc: '外部画像リンクをローカルに保存します。無効にすると、アイキャッチ画像の選択時にリモート画像をスキップします。'
            },
            downloadYoutubeThumbnails: {
                name: 'YouTubeサムネイルをダウンロード',
                desc: 'YouTubeサムネイルをローカルに保存します。無効にすると、アイキャッチ画像の選択時にYouTubeリンクをスキップします。'
            },
            optimizeNotebookNavigator: {
                name: 'Notebook Navigator向けに最適化',
                desc: 'Notebook Navigator向けにサムネイル設定を最適化し、すべてのリサイズ済みサムネイルを再レンダリングします。',
                action: '最適化'
            },
            debugMode: {
                name: 'デバッグモード',
                desc: 'デバッグモードを有効にして、コンソールに詳細情報をログ出力します。'
            },
            dryRun: {
                name: 'ドライラン',
                desc: 'ドライランを有効にして、ファイルへの変更を防ぎます。'
            }
        },

        info: {
            rerenderTip:
                'ヒント：配置や寸法の設定を変更した後、コマンドパレットから「すべてのリサイズされたサムネイルを再レンダリング」コマンドを実行して、既存のサムネイルを新しい設定で更新してください。'
        }
    },

    // Notices
    notices: {
        updatingAllFiles: 'すべてのファイルのアイキャッチ画像を更新中...',
        updatingFolder: '現在のフォルダのアイキャッチ画像を更新中...',
        removingAllImages: 'すべてのファイルからアイキャッチ画像を削除中...',
        cleaningUpUnused: '未使用の画像をクリーンアップ中...',
        rerenderingThumbnails: 'すべてのサムネイルを再レンダリング中...',
        completed: '完了',
        noActiveFile: 'アクティブなファイルがありません',
        errorOccurred: 'エラーが発生しました',
        featureSet: 'アイキャッチ画像を設定しました',
        featureUpdated: 'アイキャッチ画像を更新しました',
        featureRemoved: 'アイキャッチ画像を削除しました',
        featureUnchanged: 'アイキャッチ画像は変更されませんでした',
        dryRunEnabled: 'ドライラン有効 - 変更は行われませんでした',
        filesProcessed: '{count}個のファイルを処理しました',
        imagesDeleted: '{count}個の画像を削除しました',
        thumbnailsRerendered: '{count}個のサムネイルを再レンダリングしました'
    },

    // Modals
    modals: {
        mtimeOffsetNote: '注意: 同期サービスが変更を検出できるように、ファイルの更新時刻を約1.5秒先にずらします。'
    },

    // Errors
    errors: {
        httpImageLinkIgnored: (filePath: string, url: string, source?: string) =>
            `HTTP${source ? ` ${source}` : ''}画像リンクを${filePath}で無視しました: ${url}。Featured ImageはHTTPSリンクのみ処理します。リンクをHTTPSに変更してください。`
    }
};
