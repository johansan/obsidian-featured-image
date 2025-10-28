/**
 * German language strings for Featured Image
 */
export const STRINGS_DE = {
    // Commands
    commands: {
        updateAll: 'Feature-Eigenschaften in allen Dateien setzen (hinzufügen oder aktualisieren)',
        updateAllNoThumbnail: 'Featured Images in allen Dateien setzen (hinzufügen oder aktualisieren)',
        updateFolder: 'Feature-Eigenschaften im aktuellen Ordner setzen (hinzufügen oder aktualisieren)',
        updateFolderNoThumbnail: 'Featured Images im aktuellen Ordner setzen (hinzufügen oder aktualisieren)',
        removeAll: 'Feature-Eigenschaften in allen Dateien entfernen',
        removeAllNoThumbnail: 'Featured Images in allen Dateien entfernen',
        cleanupUnused: 'Ungenutzte heruntergeladene Bilder und Vorschaubilder entfernen',
        rerenderThumbnails: 'Alle verkleinerten Vorschaubilder neu rendern'
    },

    // Settings
    settings: {
        headings: {
            advanced: 'Erweitert',
            localMedia: 'Lokale Medien',
            externalMedia: 'Externe Medien',
            notebookNavigator: 'Notebook Navigator'
        },

        items: {
            showNotifications: {
                name: 'Benachrichtigungen anzeigen',
                desc: 'Benachrichtigungen anzeigen, wenn das Featured Image gesetzt, aktualisiert oder entfernt wird.'
            },
            frontmatterProperty: {
                name: 'Frontmatter-Eigenschaft',
                desc: 'Der Name der Frontmatter-Eigenschaft, die mit dem Featured Image aktualisiert werden soll'
            },
            thumbnailsFolder: {
                name: 'Vorschaubilder-Ordner',
                desc: 'Ordner für heruntergeladene Vorschaubilder und verkleinerte Bilder. Unterordner werden automatisch für verschiedene Bildtypen erstellt.'
            },
            excludedFolders: {
                name: 'Ausgeschlossene Ordner',
                desc: 'Kommagetrennte Liste von Ordnern, die vom Featured Image Plugin ausgeschlossen werden sollen.'
            },
            resizeFeatureImage: {
                name: 'Feature-Bild verkleinern',
                desc: 'Feature-Bild für bessere Leistung in scrollenden Listen oder Plugins wie Notebook Navigator verkleinern.'
            },
            resizedThumbnailProperty: {
                name: 'Name der verkleinerten Vorschaubild-Eigenschaft',
                desc: 'Der Name der Frontmatter-Eigenschaft zum Speichern des verkleinerten Vorschaubild-Pfads.',
                placeholder: 'thumbnail'
            },
            maxResizedWidth: {
                name: 'Maximale verkleinerte Breite',
                desc: 'Maximale Breite des verkleinerten Vorschaubilds in Pixeln. 0 für keine Breitenbeschränkung verwenden.',
                placeholder: '256'
            },
            maxResizedHeight: {
                name: 'Maximale verkleinerte Höhe',
                desc: 'Maximale Höhe des verkleinerten Vorschaubilds in Pixeln. 0 für keine Höhenbeschränkung verwenden.',
                placeholder: '144'
            },
            fillResizedDimensions: {
                name: 'Verkleinerte Dimensionen ausfüllen',
                desc: 'Wenn aktiviert, haben verkleinerte Vorschaubilder genau die durch maximale Breite und Höhe angegebene Größe, wobei das Seitenverhältnis beibehalten und zum Ausfüllen der Dimensionen zugeschnitten wird.'
            },
            verticalAlignment: {
                name: 'Vertikale Ausrichtung',
                desc: 'Wählen Sie die vertikale Ausrichtung für zugeschnittene Bilder.',
                options: {
                    top: 'Oben',
                    center: 'Mitte',
                    bottom: 'Unten'
                }
            },
            horizontalAlignment: {
                name: 'Horizontale Ausrichtung',
                desc: 'Wählen Sie die horizontale Ausrichtung für zugeschnittene Bilder.',
                options: {
                    left: 'Links',
                    center: 'Mitte',
                    right: 'Rechts'
                }
            },
            showAdvancedSettings: {
                name: 'Erweiterte Einstellungen anzeigen',
                desc: 'Erweiterte Konfigurationsoptionen ein- oder ausblenden'
            },
            mediaLinkFormat: {
                name: 'Medienlink-Format',
                desc: 'Wählen Sie, wie die Featured Image Eigenschaft im Frontmatter formatiert werden soll.'
            },
            onlyUpdateExisting: {
                name: 'Nur aktualisieren, wenn Frontmatter-Eigenschaft existiert',
                desc: 'Aktivieren Sie dies, um die Frontmatter-Eigenschaft nur zu aktualisieren, wenn sie bereits existiert.'
            },
            keepEmptyProperty: {
                name: 'Leere Eigenschaft beibehalten',
                desc: 'Wenn aktiviert, wird die Frontmatter-Eigenschaft beibehalten, aber auf einen leeren String gesetzt, wenn kein Featured Image gefunden wird. Wenn deaktiviert, wird die Eigenschaft entfernt.'
            },
            preserveTemplateImages: {
                name: 'Bestehende Eigenschaft nicht löschen',
                desc: 'Wenn aktiviert, wird die bestehende Featured Image Eigenschaft beibehalten, wenn kein Bild im Dokument gefunden wird. Wenn deaktiviert, wird die Eigenschaft gelöscht oder entfernt, wenn kein Bild erkannt wird (abhängig von der Einstellung "Leere Eigenschaft beibehalten").'
            },
            requireExclamationForYouTube: {
                name: 'Ausrufezeichen für YouTube-Vorschaubilder erforderlich',
                desc: 'Wenn aktiviert, werden nur YouTube-Links mit vorangestelltem Ausrufezeichen für den Vorschaubild-Download berücksichtigt.'
            },
            downloadExternalImages: {
                name: 'Externe Bilder in den Vorschaubilder-Ordner herunterladen',
                desc: 'Externe Bildlinks lokal speichern. Deaktivieren, um entfernte Bilder bei der Auswahl eines Featured Image zu überspringen.'
            },
            downloadYoutubeThumbnails: {
                name: 'YouTube-Vorschaubilder herunterladen',
                desc: 'YouTube-Vorschaubilder lokal speichern. Deaktivieren, um YouTube-Links bei der Auswahl eines Featured Image zu überspringen.'
            },
            optimizeNotebookNavigator: {
                name: 'Einstellungen für Notebook Navigator optimieren',
                desc: 'Optimiert die Thumbnail-Einstellungen für Notebook Navigator und rendert alle verkleinerten Vorschaubilder neu.',
                action: 'Optimieren'
            },
            debugMode: {
                name: 'Debug-Modus',
                desc: 'Debug-Modus aktivieren, um detaillierte Informationen in der Konsole zu protokollieren.'
            },
            dryRun: {
                name: 'Testlauf',
                desc: 'Testlauf aktivieren, um zu verhindern, dass Änderungen an Ihren Dateien vorgenommen werden.'
            }
        },

        info: {
            rerenderTip:
                'Tipp: Nach dem Ändern der Ausrichtungs- oder Dimensionseinstellungen führen Sie den Befehl "Alle verkleinerten Vorschaubilder neu rendern" aus der Befehlspalette aus, um vorhandene Vorschaubilder mit den neuen Einstellungen zu aktualisieren.'
        }
    },

    // Notices
    notices: {
        updatingAllFiles: 'Featured Images in allen Dateien werden aktualisiert...',
        updatingFolder: 'Featured Images im aktuellen Ordner werden aktualisiert...',
        removingAllImages: 'Featured Images aus allen Dateien werden entfernt...',
        cleaningUpUnused: 'Ungenutzte Bilder werden bereinigt...',
        rerenderingThumbnails: 'Alle Vorschaubilder werden neu gerendert...',
        completed: 'Abgeschlossen',
        noActiveFile: 'Keine aktive Datei',
        errorOccurred: 'Ein Fehler ist aufgetreten',
        featureSet: 'Feature-Bild gesetzt',
        featureUpdated: 'Feature-Bild aktualisiert',
        featureRemoved: 'Feature-Bild entfernt',
        featureUnchanged: 'Feature-Bild unverändert',
        dryRunEnabled: 'Testlauf aktiviert - keine Änderungen vorgenommen',
        filesProcessed: '{count} Dateien verarbeitet',
        imagesDeleted: '{count} Bilder gelöscht',
        thumbnailsRerendered: '{count} Vorschaubilder neu gerendert'
    }
};
