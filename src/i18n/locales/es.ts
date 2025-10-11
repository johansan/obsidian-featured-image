/**
 * Spanish language strings for Featured Image
 */
export const STRINGS_ES = {
    // Commands
    commands: {
        updateAll: 'Establecer propiedades de imagen destacada en todos los archivos (agregar o actualizar)',
        updateAllNoThumbnail: 'Establecer imágenes destacadas en todos los archivos (agregar o actualizar)',
        updateFolder: 'Establecer propiedades de imagen destacada en la carpeta actual (agregar o actualizar)',
        updateFolderNoThumbnail: 'Establecer imágenes destacadas en la carpeta actual (agregar o actualizar)',
        removeAll: 'Eliminar propiedades de imagen destacada en todos los archivos',
        removeAllNoThumbnail: 'Eliminar imágenes destacadas en todos los archivos',
        cleanupUnused: 'Eliminar imágenes descargadas y miniaturas no utilizadas',
        rerenderThumbnails: 'Volver a renderizar todas las miniaturas redimensionadas'
    },

    // Settings
    settings: {
        headings: {
            advanced: 'Avanzado',
            localMedia: 'Medios locales',
            externalMedia: 'Medios externos'
        },

        items: {
            showNotifications: {
                name: 'Mostrar notificaciones',
                desc: 'Mostrar notificaciones cuando la imagen destacada se establece, actualiza o elimina.'
            },
            frontmatterProperty: {
                name: 'Propiedad de frontmatter',
                desc: 'El nombre de la propiedad de frontmatter para actualizar con la imagen destacada'
            },
            thumbnailsFolder: {
                name: 'Carpeta de miniaturas',
                desc: 'Carpeta para miniaturas descargadas e imágenes redimensionadas. Se crearán automáticamente subcarpetas para diferentes tipos de imágenes.'
            },
            excludedFolders: {
                name: 'Carpetas excluidas',
                desc: 'Lista separada por comas de carpetas a excluir del plugin de imagen destacada.'
            },
            resizeFeatureImage: {
                name: 'Redimensionar imagen destacada',
                desc: 'Redimensionar imagen destacada para mejor rendimiento en listas desplazables o plugins como Notebook Navigator.'
            },
            resizedThumbnailProperty: {
                name: 'Nombre de propiedad de miniatura redimensionada',
                desc: 'El nombre de la propiedad de frontmatter para almacenar la ruta de la miniatura redimensionada.',
                placeholder: 'thumbnail'
            },
            maxResizedWidth: {
                name: 'Ancho máximo redimensionado',
                desc: 'Ancho máximo de la miniatura redimensionada en píxeles. Use 0 para sin restricción de ancho.',
                placeholder: '128'
            },
            maxResizedHeight: {
                name: 'Altura máxima redimensionada',
                desc: 'Altura máxima de la miniatura redimensionada en píxeles. Use 0 para sin restricción de altura.',
                placeholder: '128'
            },
            fillResizedDimensions: {
                name: 'Llenar dimensiones redimensionadas',
                desc: 'Cuando está habilitado, las miniaturas redimensionadas tendrán exactamente el tamaño especificado por el ancho y la altura máximos, manteniendo la relación de aspecto y recortando para llenar las dimensiones.'
            },
            verticalAlignment: {
                name: 'Alineación vertical',
                desc: 'Elija la alineación vertical para imágenes recortadas.',
                options: {
                    top: 'Superior',
                    center: 'Centro',
                    bottom: 'Inferior'
                }
            },
            horizontalAlignment: {
                name: 'Alineación horizontal',
                desc: 'Elija la alineación horizontal para imágenes recortadas.',
                options: {
                    left: 'Izquierda',
                    center: 'Centro',
                    right: 'Derecha'
                }
            },
            showAdvancedSettings: {
                name: 'Mostrar configuración avanzada',
                desc: 'Alternar para mostrar u ocultar opciones de configuración avanzada'
            },
            mediaLinkFormat: {
                name: 'Formato de enlace de medios',
                desc: 'Elija cómo formatear la propiedad de imagen destacada en el frontmatter.'
            },
            onlyUpdateExisting: {
                name: 'Solo actualizar si existe la propiedad de frontmatter',
                desc: 'Habilite esto para actualizar solo la propiedad de frontmatter si ya existe.'
            },
            keepEmptyProperty: {
                name: 'Mantener propiedad vacía',
                desc: 'Cuando está habilitado, la propiedad de frontmatter se mantendrá pero se establecerá en una cadena vacía si no se encuentra una imagen destacada. Cuando está deshabilitado, la propiedad se eliminará.'
            },
            preserveTemplateImages: {
                name: 'No borrar propiedad existente',
                desc: 'Cuando está habilitado, mantiene la propiedad de imagen destacada existente si no se encuentra ninguna imagen en el documento. Cuando está deshabilitado, borra o elimina la propiedad cuando no se detecta ninguna imagen (dependiendo de la configuración "Mantener propiedad vacía").'
            },
            requireExclamationForYouTube: {
                name: 'Requerir signo de exclamación para miniaturas de YouTube',
                desc: 'Si está habilitado, solo los enlaces de YouTube con prefijo de signo de exclamación se considerarán para la descarga de miniaturas.'
            },
            downloadExternalImages: {
                name: 'Descargar imágenes externas en la carpeta de miniaturas',
                desc: 'Almacenar enlaces de imágenes externas localmente. Deshabilite para omitir imágenes remotas al seleccionar la imagen destacada.'
            },
            downloadYoutubeThumbnails: {
                name: 'Descargar miniaturas de YouTube',
                desc: 'Almacenar miniaturas de YouTube localmente. Deshabilite para omitir enlaces de YouTube al seleccionar la imagen destacada.'
            },
            captureVideoPoster: {
                name: 'Capturar fotograma inicial de video',
                desc: 'Crea una imagen fija del primer fotograma de videos locales y la usa como imagen destacada.'
            },
            videoExtensions: {
                name: 'Extensiones de video locales',
                desc: 'Lista separada por comas de extensiones de archivo de video elegibles para la captura de fotogramas.',
                placeholder: 'mp4,mov,m4v,webm'
            },
            localImageExtensions: {
                name: 'Extensiones de imagen local',
                desc: 'Lista separada por comas de extensiones de archivo de imagen para buscar en documentos.',
                placeholder: 'png,jpg,jpeg,gif,webp'
            },
            debugMode: {
                name: 'Modo de depuración',
                desc: 'Habilitar el modo de depuración para registrar información detallada en la consola.'
            },
            dryRun: {
                name: 'Ejecución de prueba',
                desc: 'Habilitar la ejecución de prueba para evitar que se realicen cambios en sus archivos.'
            }
        },

        info: {
            rerenderTip:
                'Consejo: Después de cambiar la configuración de alineación o dimensiones, ejecute el comando "Volver a renderizar todas las miniaturas redimensionadas" desde la paleta de comandos para actualizar las miniaturas existentes con la nueva configuración.'
        }
    },

    // Notices
    notices: {
        updatingAllFiles: 'Actualizando imágenes destacadas en todos los archivos...',
        updatingFolder: 'Actualizando imágenes destacadas en la carpeta actual...',
        removingAllImages: 'Eliminando imágenes destacadas de todos los archivos...',
        cleaningUpUnused: 'Limpiando imágenes no utilizadas...',
        rerenderingThumbnails: 'Volviendo a renderizar todas las miniaturas...',
        completed: 'Completado',
        noActiveFile: 'Sin archivo activo',
        errorOccurred: 'Ocurrió un error',
        featureSet: 'Imagen destacada establecida',
        featureUpdated: 'Imagen destacada actualizada',
        featureRemoved: 'Imagen destacada eliminada',
        featureUnchanged: 'Imagen destacada sin cambios',
        dryRunEnabled: 'Ejecución de prueba habilitada - no se realizaron cambios',
        filesProcessed: '{count} archivos procesados',
        imagesDeleted: '{count} imágenes eliminadas',
        thumbnailsRerendered: '{count} miniaturas re-renderizadas'
    }
};
