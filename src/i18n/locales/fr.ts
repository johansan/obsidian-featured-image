/**
 * French language strings for Featured Image
 */
export const STRINGS_FR = {
    // Commands
    commands: {
        updateAll: "Définir les propriétés d'image vedette dans tous les fichiers (ajouter ou mettre à jour)",
        updateAllNoThumbnail: 'Définir les images vedettes dans tous les fichiers (ajouter ou mettre à jour)',
        updateFolder: "Définir les propriétés d'image vedette dans le dossier actuel (ajouter ou mettre à jour)",
        updateFolderNoThumbnail: 'Définir les images vedettes dans le dossier actuel (ajouter ou mettre à jour)',
        removeAll: "Supprimer les propriétés d'image vedette dans tous les fichiers",
        removeAllNoThumbnail: 'Supprimer les images vedettes dans tous les fichiers',
        cleanupUnused: 'Supprimer les images téléchargées et miniatures inutilisées',
        rerenderThumbnails: 'Re-générer toutes les miniatures redimensionnées'
    },

    // Settings
    settings: {
        headings: {
            advanced: 'Avancé',
            externalMedia: 'Médias externes'
        },

        items: {
            showNotifications: {
                name: 'Afficher les notifications',
                desc: "Afficher les notifications lorsque l'image vedette est définie, mise à jour ou supprimée."
            },
            frontmatterProperty: {
                name: 'Propriété frontmatter',
                desc: "Le nom de la propriété frontmatter à mettre à jour avec l'image vedette"
            },
            thumbnailsFolder: {
                name: 'Dossier des miniatures',
                desc: "Dossier pour les miniatures téléchargées et les images redimensionnées. Des sous-dossiers seront créés automatiquement pour différents types d'images."
            },
            excludedFolders: {
                name: 'Dossiers exclus',
                desc: "Liste de dossiers séparés par des virgules à exclure du plugin d'image vedette."
            },
            resizeFeatureImage: {
                name: "Redimensionner l'image vedette",
                desc: "Redimensionner l'image vedette pour de meilleures performances dans les listes défilantes ou les plugins comme Notebook Navigator."
            },
            resizedThumbnailProperty: {
                name: 'Nom de la propriété de miniature redimensionnée',
                desc: 'Le nom de la propriété frontmatter pour stocker le chemin de la miniature redimensionnée.',
                placeholder: 'thumbnail'
            },
            maxResizedWidth: {
                name: 'Largeur maximale redimensionnée',
                desc: 'Largeur maximale de la miniature redimensionnée en pixels. Utilisez 0 pour aucune restriction de largeur.',
                placeholder: '128'
            },
            maxResizedHeight: {
                name: 'Hauteur maximale redimensionnée',
                desc: 'Hauteur maximale de la miniature redimensionnée en pixels. Utilisez 0 pour aucune restriction de hauteur.',
                placeholder: '128'
            },
            fillResizedDimensions: {
                name: 'Remplir les dimensions redimensionnées',
                desc: "Lorsque activé, les miniatures redimensionnées auront exactement la taille spécifiée par la largeur et la hauteur maximales, en maintenant le rapport d'aspect et en recadrant pour remplir les dimensions."
            },
            verticalAlignment: {
                name: 'Alignement vertical',
                desc: "Choisissez l'alignement vertical pour les images recadrées.",
                options: {
                    top: 'Haut',
                    center: 'Centre',
                    bottom: 'Bas'
                }
            },
            horizontalAlignment: {
                name: 'Alignement horizontal',
                desc: "Choisissez l'alignement horizontal pour les images recadrées.",
                options: {
                    left: 'Gauche',
                    center: 'Centre',
                    right: 'Droite'
                }
            },
            showAdvancedSettings: {
                name: 'Afficher les paramètres avancés',
                desc: 'Basculer pour afficher ou masquer les options de configuration avancées'
            },
            mediaLinkFormat: {
                name: 'Format de lien média',
                desc: "Choisissez comment formater la propriété d'image vedette dans le frontmatter."
            },
            onlyUpdateExisting: {
                name: 'Mettre à jour uniquement si la propriété frontmatter existe',
                desc: 'Activez ceci pour mettre à jour uniquement la propriété frontmatter si elle existe déjà.'
            },
            keepEmptyProperty: {
                name: 'Conserver la propriété vide',
                desc: "Lorsque activé, la propriété frontmatter sera conservée mais définie sur une chaîne vide si aucune image vedette n'est trouvée. Lorsque désactivé, la propriété sera supprimée."
            },
            preserveTemplateImages: {
                name: 'Ne pas effacer la propriété existante',
                desc: "Lorsque activé, conserve la propriété d'image vedette existante si aucune image n'est trouvée dans le document. Lorsque désactivé, efface ou supprime la propriété lorsqu'aucune image n'est détectée (selon le paramètre \"Conserver la propriété vide\")."
            },
            requireExclamationForYouTube: {
                name: "Exiger un point d'exclamation pour les miniatures YouTube",
                desc: "Si activé, seuls les liens YouTube préfixés d'un point d'exclamation seront considérés pour le téléchargement de miniatures."
            },
            downloadWebP: {
                name: 'Télécharger WebP',
                desc: 'Télécharger les versions WebP des images de YouTube si disponibles, sinon télécharger JPG.'
            },
            downloadExternalImages: {
                name: 'Télécharger les images externes dans le dossier des miniatures',
                desc: "Stocker les liens d'images externes localement. Désactivez pour ignorer les images distantes lors de la sélection de l'image vedette."
            },
            downloadYoutubeThumbnails: {
                name: 'Télécharger les miniatures YouTube',
                desc: 'Stocker les miniatures YouTube localement. Désactivez pour ignorer les liens YouTube lors de la sélection de l’image vedette.'
            },
            localImageExtensions: {
                name: "Extensions d'image locales",
                desc: "Liste d'extensions de fichiers image séparées par des virgules à rechercher dans les documents.",
                placeholder: 'png,jpg,jpeg,gif,webp'
            },
            debugMode: {
                name: 'Mode débogage',
                desc: 'Activer le mode débogage pour enregistrer des informations détaillées dans la console.'
            },
            dryRun: {
                name: 'Exécution à blanc',
                desc: "Activer l'exécution à blanc pour empêcher toute modification de vos fichiers."
            }
        },

        info: {
            rerenderTip:
                'Astuce : Après avoir modifié les paramètres d\'alignement ou de dimensions, exécutez la commande "Re-générer toutes les miniatures redimensionnées" depuis la palette de commandes pour mettre à jour les miniatures existantes avec les nouveaux paramètres.'
        }
    },

    // Notices
    notices: {
        updatingAllFiles: 'Mise à jour des images vedettes dans tous les fichiers...',
        updatingFolder: 'Mise à jour des images vedettes dans le dossier actuel...',
        removingAllImages: 'Suppression des images vedettes de tous les fichiers...',
        cleaningUpUnused: 'Nettoyage des images inutilisées...',
        rerenderingThumbnails: 'Re-génération de toutes les miniatures...',
        completed: 'Terminé',
        noActiveFile: 'Aucun fichier actif',
        errorOccurred: "Une erreur s'est produite",
        featureSet: 'Image vedette définie',
        featureUpdated: 'Image vedette mise à jour',
        featureRemoved: 'Image vedette supprimée',
        featureUnchanged: 'Image vedette inchangée',
        dryRunEnabled: 'Exécution à blanc activée - aucune modification effectuée',
        filesProcessed: '{count} fichiers traités',
        imagesDeleted: '{count} images supprimées',
        thumbnailsRerendered: '{count} miniatures re-générées'
    }
};
