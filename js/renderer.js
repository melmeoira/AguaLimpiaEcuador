import { LeafletMap, TileLayer, GeoJSON, CircleMarker, LayerGroup, DivIcon, Marker, LatLngBounds  } from 'leaflet';


class SocialWaterMap {
    // Propiedades estáticas de configuración de la clase
    static LIMITES_CONTINENTE = [ [-5.01, -81.08], [1.65, -75.19] ];

    static OPCIONES_ENCUADRE = {
        paddingTopLeft: [-230,0],  
        maxZoom: 7,                 // Evitamos un acercamiento excesivo en pantallas pequeñas
        animate: true               // Suaviza la transición inicial
    };


    constructor() {
        // Inicialización de las propiedades de control de la instancia
        this.mapaInstancia = null;
        this.listaComunidadesGlobal = [];
        this.filtroActivo = "Todas";
        
        // Instancias de grupos de capas para el controlador de Checkboxes
        this.grupoCapitales = new LayerGroup();
        this.grupoRios = new LayerGroup();
    }

    /**
     * Inicializa el núcleo de la aplicación y la carga de datos paralela
     */
    init() {
        // Instanciación del mapa base
        this.mapaInstancia = new LeafletMap('map', {
            zoomControl: true,
            attributionControl: true
        });

        // Configuración de la capa satelital de Esri
        new TileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            maxNativeZoom: 17
        }).addTo(this.mapaInstancia);

        this.configurarInteractividadIframe();

        // Registro de los gestores seguros de eventos globales del mapa y modal
        this.configurarEventosMapa();
        this.configurarCierreModal();

        // Carga concurrente y asíncrona de ficheros externos
        Promise.all([
            fetch('geojson/ecuador.geojson').then(res => { if (!res.ok) throw new Error(); return res.json(); }),
            fetch('geojson/comunidades.json').then(res => { if (!res.ok) throw new Error(); return res.json(); }),
            fetch('geojson/capitales.geojson').then(res => { if (!res.ok) throw new Error(); return res.json(); }),
            fetch('geojson/rios_corregidos.geojson').then(res => { if (!res.ok) throw new Error(); return res.json(); })
        ])
        .then(([datosFrontera, datosComunidades, datosCapitales, datosRios]) => {
            datosComunidades.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
            this.procesarCapaFrontera(datosFrontera);
            this.inicializarCapasSecundarias(datosCapitales, datosRios);
            this.inicializarControlesCapas();
            this.inicializarComunidades(datosComunidades);
            this.actualizarContadores(datosComunidades);
            this.configurarFiltros();
            this.configurarBuscador();
        })
        .catch(error => {
            console.error("Error al inicializar los datos del mapa:", error);
        });
    }

    /**
     * Gestiona los eventos seguros del Popup y el Carrusel para Leaflet 2.0.0
     */
    configurarEventosMapa() {
        this.mapaInstancia.on('popupopen', (e) => {
            const capa = e.popup._source;
            if (capa && typeof capa.closeTooltip === 'function') {
                capa.closeTooltip();
            }
            const contenedorPopup = e.popup.getElement();
            if (!contenedorPopup) return;

            // ================= GESTIÓN DE COPIADO DE COORDENADAS =================
            const elementoCoords = contenedorPopup.querySelector('.coordenadas-copiables');
            if (elementoCoords) {
                elementoCoords.addEventListener('click', () => {
                    const textoCoordenadas = elementoCoords.getAttribute('data-coords');
                    
                    // Usamos la API moderna del portapapeles de JavaScript
                    navigator.clipboard.writeText(textoCoordenadas).then(() => {
                        // Guardamos el texto original para poder restaurarlo
                        const textoOriginal = elementoCoords.innerHTML;
                        
                        // Cambiamos temporalmente el diseño para mostrar el aviso de éxito
                        elementoCoords.style.color = '#2ecc71';
                        elementoCoords.style.fontWeight = 'bold';
                        elementoCoords.innerHTML = '¡Coordenadas copiadas con éxito! ✓';
                        
                        // A los 2 segundos restauramos el texto original con una transición suave
                        setTimeout(() => {
                            elementoCoords.style.color = '';
                            elementoCoords.style.fontWeight = '';
                            elementoCoords.innerHTML = textoOriginal;
                        }, 2000);
                    }).catch(err => {
                        console.error('Error al copiar al portapapeles: ', err);
                    });
                });
            }

            const btnPdf = contenedorPopup.querySelector('.btn-exportar-pdf');
            const btnExcel = contenedorPopup.querySelector('.btn-exportar-excel');
            
            if (btnPdf && btnExcel) {
                const indiceComunidad = btnPdf.getAttribute('data-index');
                const comunidadObjeto = this.listaComunidadesGlobal[indiceComunidad].info;
                const nombreLimpio = comunidadObjeto.nombre.replace(/\s+/g, '_');

                // ================= ACCIÓN: EXPORTAR A PDF =================
                btnPdf.addEventListener('click', () => {
                    const listaFotos = (comunidadObjeto.fotos || []).slice(0, 4);
                    let seccionFotograficaHtml = '';

                    if (listaFotos.length > 0) {
                        seccionFotograficaHtml = `
                            <div style="margin-top: 10px;">
                                <p style="margin: 0 0 7px 0; font-size: 11px; color: #666; font-style: italic; border-bottom: 1px solid #eee; padding-bottom: 4px; page-break-inside: avoid;">
                                    Evidencias fotográficas registradas en campo (${listaFotos.length}):
                                </p>
                                <!-- Contenedor en cuadrícula fluida -->
                                <div style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between;">` + 
                                    listaFotos.map((rutaFoto) => `
                                        <div style="border: 1px solid #e0e0e0; padding: 4px; border-radius: 4px; background-color: #fcfcfc; width: calc(50% - 6px); box-sizing: border-box; margin-bottom: 10px; page-break-inside: avoid; display: flex; flex-direction: column; justify-content: center; align-items: center;">                                            
                                            <img src="${rutaFoto}" style="width: 100%; max-height: 220px; object-fit: contain; border-radius: 2px; display: block; background-color: #fafafa;" alt="Fotografía de la comunidad">
                                        </div>
                                    `).join('') +
                                `</div>
                            </div>
                        `;
                    } else {
                        seccionFotograficaHtml = `
                            <p style="font-size: 12px; color: #999; font-style: italic; margin-top: 10px; page-break-inside: avoid;">
                                Sin registros fotográficos disponibles en esta ficha técnica.
                            </p>
                        `;
                    }

                    // 3. Diseñamos una maqueta estática ideal para un folio A4 sin animaciones que rompan la librería
                    const estructuraHtmlPlana = `
                        <div style="padding: 25px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.5; background-color: #ffffff;">
                            <!-- Encabezado con color corporativo unificado del mapa -->
                            <div style="border-bottom: 3px solid #0077b6; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <h1 style="margin: 0; color: #0077b6; font-size: 24px; font-weight: bold;">Ficha Técnica de Comunidad</h1>
                                    <p style="margin: 5px 0 0 0; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Proyecto The Social Water - ENTSA SHIRAM</p>
                                </div>
                                <!-- Logotipo oficial de The Social Water -->
                                <img src="./img/thesocialwater.jpg" style="width: 55px; height: 55px; object-fit: contain; margin-left: 15px;" alt="Logo The Social Water">
                            </div>

                            <!-- Bloque de Información Principal -->
                            <h2 style="margin: 0 0 10px 0; color: #0056b3; font-size: 20px;">${comunidadObjeto.nombre} ` + (comunidadObjeto.pueblo ? `(Pueblo ${comunidadObjeto.pueblo})` : '') + `</h2>
                            
                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 13px;">
                                <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px 0; font-weight: bold; width: 40%;">Provincia:</td><td style="padding: 8px 0;">${comunidadObjeto.provincia}</td></tr>` +
                                (comunidadObjeto.parroquia ? `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px 0; font-weight: bold;">Parroquia:</td><td style="padding: 8px 0;">\${comunidadObjeto.parroquia}</td></tr>` : '') + 
                                `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px 0; font-weight: bold;">Coordenadas:</td><td style="padding: 8px 0;">${comunidadObjeto.coordenadas[0].toFixed(5)}, ${comunidadObjeto.coordenadas[1].toFixed(5)}</td></tr>
                                <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px 0; font-weight: bold;">Fuentes hídricas:</td><td style="padding: 8px 0;">${comunidadObjeto.tipoAgua || 'N/A'}</td></tr>
                                <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px 0; font-weight: bold;">Tipo de contaminación:</td><td style="padding: 8px 0;">${comunidadObjeto.tipoContaminacion || 'N/A'}</td></tr>
                                <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px 0; font-weight: bold;">Nivel de Riesgo:</td><td style="padding: 8px 0; font-weight: bold; color: ${comunidadObjeto.estadoGeneral.toLowerCase() === 'crítica' ? '#e74c3c' : '#f1c40f'}">${comunidadObjeto.riesgo || 'N/A'}</td></tr>
                                <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px 0; font-weight: bold;">Nº de Familias:</td><td style="padding: 8px 0;">${comunidadObjeto.numFamilias || 'N/A'}&nbsp;(Soluciones entregadas: ${comunidadObjeto.solucionesEntregadas})</td></tr>
                                <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px 0; font-weight: bold;">Estado de la comunidad:</td><td style="padding: 8px 0; font-weight: bold;">${this.getTituloEstado(comunidadObjeto.estadoGeneral)}</td></tr>
                            </table>

                            ${seccionFotograficaHtml}                            

                            <div style="margin-top: 20px; border-top: 1px solid #ddd; padding-top: 5px; text-align: center; font-size: 10px; color: #aaa;">
                                Ficha generada automáticamente desde The Social Water.
                            </div>
                        </div>
                    `;

                    const opcionesPdf = {
                        margin:       8,
                        filename:     `Ficha_TheSocialWater_${nombreLimpio}.pdf`,
                        image:        { type: 'jpeg', quality: 0.98 },
                        html2canvas:  { 
                            scale: 2,           // Duplica la densidad de píxeles para máxima nitidez
                            useCORS: true,      // Permite pintar las fotos de servidores externos sin bloqueos
                            logging: false
                        },
                        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
                    };

                    // 4. EJECUCIÓN DIRECTA: Pasamos la cadena HTML directamente al motor sin tocar el DOM
                    html2pdf().from(estructuraHtmlPlana).set(opcionesPdf).save().catch(error => {
                        console.error("Error en la compilación del reporte PDF:", error);
                    });
                });

                // ================= ACCIÓN: EXPORTAR A EXCEL (XLSX) =================
                btnExcel.addEventListener('click', () => {
                    const nombreLimpio = comunidadObjeto.nombre.replace(/\s+/g, '_');

                    // 1. Estructuramos el bloque de títulos corporativos idénticos al PDF
                    const estructuraInforme = [
                        ["FICHA TÉCNICA DE COMUNIDAD"],
                        ["Proyecto The Social Water - ENTSA SHIRAM"],
                        [], // Fila vacía de separación estética
                        // 2. Encabezados de las columnas de datos
                        [
                            'Comunidad', 
                            'Pueblo / Etnia', 
                            'Provincia', 
                            'Parroquia', 
                            'Latitud', 
                            'Longitud', 
                            'Fuentes Hídricas', 
                            'Tipo Contaminación', 
                            'Nivel de Riesgo', 
                            'Nº de Familias', 
                            'Estado General'
                        ],
                        // 3. Fila con los valores de la comunidad activa
                        [
                            comunidadObjeto.nombre,
                            comunidadObjeto.pueblo || 'N/A',
                            comunidadObjeto.provincia,
                            comunidadObjeto.parroquia || 'N/A',
                            comunidadObjeto.coordenadas[0],
                            comunidadObjeto.coordenadas[1],
                            comunidadObjeto.tipoAgua || 'N/A',
                            comunidadObjeto.tipoContaminacion || 'N/A',
                            comunidadObjeto.riesgo || 'N/A',
                            comunidadObjeto.numFamilias || 0,
                            this.getTituloEstado(comunidadObjeto.estadoGeneral)
                        ]
                    ];

                    // 4. Operaciones nativas con la API de SheetJS (XLSX)
                    // Convertimos nuestra matriz de filas ordenadas directamente en una hoja de trabajo
                    const hojaTrabajo = XLSX.utils.aoa_to_sheet(estructuraInforme);
                    const libroTrabajo = XLSX.utils.book_new();
                    
                    
                    XLSX.utils.book_append_sheet(libroTrabajo, hojaTrabajo, 'Ficha Comunidad');
                    
                    // 5. Ajuste automático dinámico del ancho de las columnas (basado en la fila de datos)
                    hojaTrabajo['!cols'] = estructuraInforme[3].map((titulo, i) => {
                        const valorCelda = String(estructuraInforme[4][i] || '');
                        const largoMaximo = Math.max(titulo.length, valorCelda.length);
                        return { wch: largoMaximo + 4 }; // Añadimos un colchón de 4 caracteres por columna
                    });

                    // Lanzar la descarga del binario de Excel estructurado
                    XLSX.writeFile(libroTrabajo, `Datos_TheSocialWater_${nombreLimpio}.xlsx`);
                });
            }

            const carrusel = contenedorPopup.querySelector('.contenedor-carrusel');
            if (!carrusel) return;

            const btnPrev = carrusel.querySelector('.btn-prev');
            const btnNext = carrusel.querySelector('.btn-next');

            if (btnPrev && btnNext) {
                btnPrev.addEventListener('click', () => this.procesarCambioFoto(carrusel, -1));
                btnNext.addEventListener('click', () => this.procesarCambioFoto(carrusel, 1));
            }

            carrusel.addEventListener('click', (evento) => {
                if (evento.target.classList.contains('foto-carrusel')) {
                    this.abrirVisorAmpliado(evento.target.src);
                }
            });
        });
    }

    /**
     * Dibuja y encuadra los límites de la frontera del país
     */
    procesarCapaFrontera(datosFrontera) {
        const limitesContinentales = new LatLngBounds();

        const capaFrontera = new GeoJSON(datosFrontera, {
            style: () => ({
                color: '#000',
                weight: 1.5,
                opacity: 0.8,
                fillColor: 'transparent'
            }),
            // ================= GESTIÓN DE RATÓN ENCIMA (HOVER) =================
            onEachFeature: (feature, layer) => {
                // Extraemos el nombre de la provincia.
                const nombreProvincia = feature.properties ? (feature.properties.shapeName || feature.properties.provincia || feature.properties.shapeName) : null;

                if (nombreProvincia) {
                    // Vinculamos un Tooltip permanente pero que solo se muestra al pasar el ratón
                    layer.bindTooltip(nombreProvincia, {
                        sticky: true, // Hace que la etiqueta siga el movimiento del cursor dentro de la provincia
                        direction: 'top',
                        className: 'leaflet-tooltip-socialwater' // Aplicamos nuestros estilos CSS con animación
                    });
                }

                const limitesProvincia = layer.getBounds();
                const esGalapagos = (nombreProvincia && nombreProvincia.toLowerCase().includes("galápagos")) || 
                                    (nombreProvincia && nombreProvincia.toLowerCase().includes("galapagos")) ||
                                    (limitesProvincia.getWest() < -83);

                // Si está dentro de la sección continental, expandimos el contenedor de límites
                if (!esGalapagos) {
                    limitesContinentales.extend(limitesProvincia);
                }

                // Eventos visuales de realce al pasar el ratón sobre el polígono
                layer.on({
                    mouseover: (e) => {
                        const poligono = e.target;
                        poligono.setStyle({
                            weight: 2,
                            opacity: 0.8,
                            color: '#00b4d8' // La frontera se ilumina en cian brillante al posarse encima
                        });
                    },
                    mouseout: (e) => {
                        const poligono = e.target;
                        poligono.setStyle({
                            weight: 1.2,
                            opacity: 0.4,
                            color: '#faf742' // Regresa a su estilo amarillo tenue original al sacar el ratón
                        });
                    }
                });
            }
            // ===================================================================
        });
        capaFrontera.addTo(this.mapaInstancia);

        this.mapaInstancia.fitBounds(limitesContinentales, SocialWaterMap.OPCIONES_ENCUADRE);

        // Configuración del botón Home de regreso al continente
        const botonHome = document.getElementById('btn-home');
        if (botonHome) {
            botonHome.addEventListener('click', () => {
                this.mapaInstancia.closePopup();
                this.mapaInstancia.fitBounds(SocialWaterMap.LIMITES_CONTINENTE, SocialWaterMap.OPCIONES_ENCUADRE);
            });
        }
    }

    /**
     * Construye las capas vectoriales y define el estado de visualización de arranque
     */
    inicializarCapasSecundarias(datosCapitales, datosRios) {
        this.crearCapaCapitales(datosCapitales);
        this.crearCapaRios(datosRios);

        // Capas activas por defecto (Ríos inicia desactivado)
        this.grupoCapitales.addTo(this.mapaInstancia);
    }

    /**
     * Vincula los Checkboxes de la interfaz HTML con los LayerGroups
     */
    inicializarControlesCapas() {
        const chkCapitales = document.getElementById('chk-capitales');
        const chkRios = document.getElementById('chk-rios');

        if (chkCapitales) {
            chkCapitales.addEventListener('change', (e) => {
                if (e.target.checked) this.grupoCapitales.addTo(this.mapaInstancia);
                else this.grupoCapitales.remove();

                this.actualizarCapasComunidades();
            });
        }

        if (chkRios) {
            chkRios.addEventListener('change', (e) => {
                if (e.target.checked) this.grupoRios.addTo(this.mapaInstancia);
                else this.grupoRios.remove();

                this.actualizarCapasComunidades();
            });
        }
    }

    /**
     * Genera los marcadores vectoriales SVG de las casitas y la estrella de Quito
     */
    crearCapaCapitales(geojsonCapitales) {
        const geojsonLayer = new GeoJSON(geojsonCapitales, {
            pointToLayer: (feature, latlng) => {
                const esQuito = feature.properties && feature.properties.nombre === "Quito";
                return new CircleMarker(latlng, {
                    radius: esQuito ? 6 : 4,      
                    fillColor: esQuito ? '#0f0d0d': '#0f0d0d',
                    color: esQuito ? '#ffffff': '#ffffff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.9
                });
            },
            onEachFeature: (feature, layer) => {
                if (feature.properties && feature.properties.nombre) {
                    const contenido = `
                        <div style="font-family: 'Segoe UI', sans-serif; padding: 2px;">
                            <strong style="color: #0077b6; font-size: 13px;">${feature.properties.nombre}</strong>
                            <p style="margin: 3px 0 0 0; font-size: 11px; color: #555;">${feature.properties.tipo}</p>
                        </div>
                    `;
                    layer.bindPopup(contenido);

                    layer.bindTooltip(feature.properties.nombre, {
                        sticky: true,                    // Sigue el cursor de forma fluida
                        direction: 'top',
                        className: 'leaflet-tooltip-socialwater' // Estilo elegante unificado de la suite
                    });
                }
            }
        });
        
        this.grupoCapitales.addLayer(geojsonLayer);
    }

    /**
     * Traza los cauces de los ríos principales
     */
    crearCapaRios(geojsonRios) {
        const geojsonLayer = new GeoJSON(geojsonRios, {
            style: () => ({
                color: '#0077b6',
                weight: 3,
                opacity: 0.75
            }),
            onEachFeature: (feature, layer) => {
                if (feature?.properties && (feature?.properties?.name_latin || feature?.properties?.name)) {
                    const nombre = feature.properties.name_latin || feature?.properties?.name;
                    let tipo = '';
                    switch (feature.properties.waterway) {
                        case 'dam': tipo = 'Presa o represa'; break;
                        case 'river': tipo = 'Rio'; break;
                        case 'ditch': tipo = 'Zanja o estero'; break;                   
                        case 'stream': tipo = 'Arroyo'; break;  ç
                        case 'canal': tipo = 'Canal'; break;  
                        case 'drain': tipo = 'Drenaje'; break;  
                        case 'waterfall': tipo = 'Cascada'; break;  
                        case 'weir': tipo = 'Azud'; break;  
                        default: tipo = 'Rio'; break;     
                    }
                    const contenido = `
                        <div style="font-family: 'Segoe UI', sans-serif; padding: 2px;">
                            <strong style="color: #0077b6; font-size: 13px;">${nombre}</strong>
                            <p style="margin: 3px 0 0 0; font-size: 11px; color: #555;">Tipo: ${tipo}</p>` + 
                            (feature.properties.tunel === 'yes' ? `<p style="margin: 3px 0 0 0; font-size: 11px; color: #555;">Túnel: Sí</p> ` : '') +
                        `</div>`;
                    layer.bindPopup(contenido);
                }
            }
        });
        this.grupoRios.addLayer(geojsonLayer);
    }

        /**
     * Mapea y guarda en memoria el catálogo de comunidades de la Amazonía
     */
    inicializarComunidades(comunidades) {
        comunidades.forEach((comunidad, indexComunidad) => {
            const htmlCasitaComunidad = `
                <svg class="svg-comunidad casita" viewBox="0 0 24 24" width="22" height="22">
                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" 
                          fill="${this.getColorEstado(comunidad.estadoGeneral)}" 
                          stroke="#ffffff" 
                          stroke-width="1.5px" />
                </svg>
            `;

            // 2. Instanciamos el DivIcon personalizado para Leaflet 2.0.0
            const iconoCasita = new DivIcon({
                html: htmlCasitaComunidad,
                className: 'contenedor-icono-comunidad',
                iconSize: [22, 22],
                iconAnchor: [14, 14],
                popupAnchor: [0, -14]
            });

            // 3. NUEVO: Usamos 'new Marker' en lugar del antiguo 'CircleMarker'
            const marcador = new Marker(comunidad.coordenadas, {
                icon: iconoCasita
            }).addTo(this.mapaInstancia);

            marcador.bindTooltip(comunidad.nombre, {
                sticky: true,
                direction: 'top',
                className: 'leaflet-tooltip-socialwater' // Reutiliza los estilos elegantes de las provincias
            });

            let htmlFotos = '';
            if (comunidad.fotos && comunidad.fotos.length > 0) {
                comunidad.fotos.forEach((rutaFoto, indexFoto) => {
                    const claseActiva = indexFoto === 0 ? 'activa' : '';
                    htmlFotos += `<img src="${rutaFoto}" class="foto-carrusel ${claseActiva}" data-index="${indexFoto}" alt="Foto ${comunidad.nombre}">`;
                });
            } else {
                htmlFotos = `<div style="color:white; text-align:center; padding-top:50px; font-size:11px;">Sin fotos registradas</div>`;
            }

            const contenidoPopup = `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; min-width: 210px;">
                    <h4 style="margin: 0 0 5px 0; color: #0077b6; font-size: 13px;">${comunidad.nombre}` + 
                    (comunidad.pueblo !== ''
                        ? ` (Pueblo ${comunidad.pueblo})`
                        : '') +
                    `</h4>
                    <p style="margin: 0 0 3px 0; font-size: 11px;"><b>Provincia:</b> ${comunidad.provincia}</p>` + 
                    (comunidad.parroquia !== ''
                        ? `<p style="margin: 0 0 3px 0; font-size: 11px;"><b>Parroquia:</b> ${comunidad.parroquia}</p>`
                        : '') +
                    `<p style="margin: 0 0 3px 0; font-size: 11px; cursor: pointer;" class="coordenadas-copiables" data-coords="${comunidad.coordenadas[0]},${comunidad.coordenadas[1]}" title="Haz clic para copiar">
                        <b>Coordenadas (lat/lon):</b> (${comunidad.coordenadas[0].toFixed(5)}, ${comunidad.coordenadas[1].toFixed(5)}) 📋
                    </p>
                    <p style="margin: 0 0 3px 0; font-size: 11px;"><b>Fuentes hídricas:</b> ${comunidad.tipoAgua || 'N/A'}</p>                    
                    <p style="margin: 0 0 3px 0; font-size: 11px;"><b>Tipo de contaminación:</b> ${comunidad.tipoContaminacion || 'N/A'}</p>
                    <p style="margin: 0 0 3px 0; font-size: 11px;"><b>Riesgo:</b> ${comunidad.riesgo || 'N/A'}</p>
                    <p style="margin: 0 0 3px 0; font-size: 11px;"><b>Nº de Familias:</b> ${comunidad.numFamilias || 'N/A'}</p>
                    <p style="margin: 0 0 3px 0; font-size: 11px;"><b>Soluciones entregadas:</b> ${comunidad.numFamilias || 'N/A'}</p>                    
                    <p style="margin: 0 0 3px 0; font-size: 11px;"><b>Estado:</b> <span style="color: ${this.getColorEstado(comunidad.estadoGeneral)}; font-weight: bold;">${this.getTituloEstado(comunidad.estadoGeneral)}</span></p>
                    
                    <div class="contenedor-carrusel" id="carrusel-${indexComunidad}">
                        ${htmlFotos}
                        ${comunidad.fotos && comunidad.fotos.length > 1 ? `
                            <button class="btn-carrusel prev btn-prev">&#10094;</button>
                            <button class="btn-carrusel next btn-next">&#10095;</button>
                        ` : ''}
                    </div>

                    <div class="zona-exportacion" style="display: flex; gap: 8px; margin-top: 10px;">
                        <button class="btn-exportar-pdf" data-index="${indexComunidad}" title="Exportar ficha a PDF" style="flex: 1; padding: 6px; background-color: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; display: flex; justify-content: center; align-items: center;">
                            📄 <span style="font-size: 11px; font-weight: bold; margin-left: 4px;">PDF</span>
                        </button>
                        <button class="btn-exportar-excel" data-index="${indexComunidad}" title="Exportar datos a Excel" style="flex: 1; padding: 6px; background-color: #2ecc71; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; display: flex; justify-content: center; align-items: center;">
                            📊 <span style="font-size: 11px; font-weight: bold; margin-left: 4px;">XLSX</span>
                        </button>
                    </div>
                </div>
            `;
            marcador.bindPopup(contenidoPopup);

            this.listaComunidadesGlobal.push({
                info: comunidad,
                marcadorMapa: marcador
            });
        });

        this.filtrarYMostrar();
    }

    actualizarCapasComunidades() {
        this.listaComunidadesGlobal.forEach(item => {
            const marcador = item.marcadorMapa;
            
            // Si el marcador está actualmente visible y activo en el mapa satelital,
            // ejecutamos bringToFront() para obligar al motor a ponerlo al frente del SVG
            if (this.mapaInstancia.hasLayer(marcador)) {
                if (typeof marcador.bringToFront === 'function') {
                    marcador.bringToFront();
                }
            }
        });
    }

    /**
     * Calcula dinámicamente e inyecta las cantidades en los botones de filtro
     */
    actualizarContadores(comunidades) {
        let totales = { Todas: comunidades.length, recup: 0, Alerta: 0, Critica: 0 };
        comunidades.forEach(comunidad => {
            const estado = comunidad.estadoGeneral.trim().toLowerCase();
            if (estado === "recuperacion") totales.recup++;
            if (estado === "alerta") totales.Alerta++;
            if (estado === "crítica" || estado === "critica") totales.Critica++;
        });
        const select = document.getElementById('select-filtro');
        if (select) {
            select.options[0].textContent = `Todas (${totales.Todas})`;
            select.options[1].textContent = `En recuperación (${totales.recup})`;
            select.options[2].textContent = `Alerta (${totales.Alerta})`;
            select.options[3].textContent = `Crítica (${totales.Critica})`;
        }
    }

    /**
     * Activa la escucha del evento de cambio de opción (change) en el ComboBox
     */
    configurarFiltros() {
        const selectFiltro = document.getElementById('select-filtro');
        if (selectFiltro) {
            selectFiltro.addEventListener('change', (e) => {
                this.filtroActivo = e.target.value;
                this.filtrarYMostrar();
            });
        }
    }


    /**
     * Activa la escucha en tiempo real de la barra de búsqueda y del switch humanitario
     */
    configurarBuscador() {
        const buscador = document.getElementById('input-busqueda');
        if (buscador) {
            buscador.addEventListener('input', () => this.filtrarYMostrar());
        }

        const chkSinFiltros = document.getElementById('chk-sin-filtros');
        if (chkSinFiltros) {
            chkSinFiltros.addEventListener('change', () => this.filtrarYMostrar());
        }
    }

    getColorEstado(estado){
        switch(estado.toLowerCase()) {
            case 'recuperacion':  return '#2ecc71';
            case 'alerta':  return '#f1c40f';
            case 'crítica': return '#e74c3c';                
        }
    }

    getTituloEstado(estado){
        switch(estado.toLowerCase()) {
            case 'recuperacion':  return 'En recuperación';
            case 'alerta':  return 'Alerta';
            case 'crítica': return 'Crítica';                
        }
    }

    /**
     * Centraliza el triple cruce de filtros (Estado + Búsqueda Texto + Filtro avanzado)
     */
    filtrarYMostrar() {
        const contenedorLista = document.getElementById('lista-comunidades');
        const textoBusqueda = document.getElementById('input-busqueda')?.value.toLowerCase().trim() || "";
        const soloSinFiltros = document.getElementById('chk-sin-filtros')?.checked || false;
        
        if (!contenedorLista) return;
        contenedorLista.innerHTML = ''; 
        this.mapaInstancia.closePopup();     

        this.listaComunidadesGlobal.forEach(item => {
            const comunidad = item.info;
            const marcador = item.marcadorMapa;

            let colorEstado = this.getColorEstado(comunidad.estadoGeneral?.toLowerCase());

            const cumpleFiltroEstado = (this.filtroActivo === "Todas" || comunidad.estadoGeneral === this.filtroActivo);
            const cumpleBusquedaTexto = (
                comunidad.nombre.toLowerCase().includes(textoBusqueda) || 
                comunidad.provincia.toLowerCase().includes(textoBusqueda)
            );
            const cumpleFiltroHumanitario = !soloSinFiltros || (comunidad.tieneFiltro && comunidad.tieneFiltro.trim() === "No");

            if (cumpleFiltroEstado && cumpleBusquedaTexto && cumpleFiltroHumanitario) {
                if (!this.mapaInstancia.hasLayer(marcador)) marcador.addTo(this.mapaInstancia);

                const tarjetaHtml = document.createElement('div');
                tarjetaHtml.className = 'tarjeta-comunidad';
                tarjetaHtml.style.borderLeft = `5px solid ${colorEstado}`;
                tarjetaHtml.innerHTML = `
                    <h5>${comunidad.nombre}` + 
                    (comunidad.pueblo !== ''
                        ? `<span style="font-size: 0.8rem;"> (Pueblo ${comunidad.pueblo})</span>`
                        : '') +
                    `</h5>
                    <p style="margin: 0 0 4px 0;">Provincia: ${comunidad.provincia}</p>
                    <span class="etiqueta-estado" style="background-color: ${this.getColorEstado(comunidad.estadoGeneral)}">${this.getTituloEstado(comunidad.estadoGeneral)}</span>
                    <p style="margin: 0 0 4px 0; font-size: 0.75rem;">Familias: <b>${comunidad.numFamilias || 0}</b></p>`;

                tarjetaHtml.addEventListener('click', () => {
                    this.mapaInstancia.setView(comunidad.coordenadas, 12);
                    marcador.openPopup();
                });

                contenedorLista.appendChild(tarjetaHtml);
            } else {
                marcador.remove();
            }
        });
    }

    /**
     * Realiza las transiciones en bucle del carrusel de imágenes
     */
    procesarCambioFoto(contenedorCarrusel, direccion) {
        const fotos = contenedorCarrusel.querySelectorAll('.foto-carrusel');
        if (fotos.length <= 1) return;

        let indexActivo = 0;
        fotos.forEach((foto, index) => {
            if (foto.classList.contains('activa')) indexActivo = index;
        });

        // El CSS se encarga de desvanecer esta foto (opacity: 0)
        fotos[indexActivo].classList.remove('activa');

        let nuevoIndex = indexActivo + direccion;
        if (nuevoIndex >= fotos.length) nuevoIndex = 0;
        if (nuevoIndex < 0) nuevoIndex = fotos.length - 1;

        // El CSS se encarga de fundir la nueva foto de forma suave (opacity: 1)
        fotos[nuevoIndex].classList.add('activa');
    }

    /**
     * Despliega la foto ampliada en la ventana flotante modal
     */
    abrirVisorAmpliado(src) {
        const modal = document.getElementById('modal-visor');
        const imgAmpliada = document.getElementById('imagen-ampliada');
        
        if (modal && imgAmpliada) {
            imgAmpliada.src = src;
            modal.classList.add('visible'); // El CSS se encarga del fundido y escalado de entrada
        }
    }

    /**
     * Sincroniza los escuchadores nativos para cerrar la ampliación de fotos
     */
    configurarCierreModal() {
        const modal = document.getElementById('modal-visor');
        const btnCerrar = document.getElementById('btn-cerrar-modal');

        if (!modal) return;

        if (btnCerrar) {
            btnCerrar.addEventListener('click', () => modal.classList.remove('visible'));
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('visible');
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('visible')) {
                modal.classList.remove('visible');
            }
        });
    }

    configurarInteractividadIframe() {
        // Al hacer clic dentro del mapa, se activa la rueda para poder hacer zoom
        this.mapaInstancia.on('click', () => {
            if (this.mapaInstancia.scrollWheelZoom) {
                this.mapaInstancia.scrollWheelZoom.enable();
            }
        });

        // Al sacar el cursor del mapa, se vuelve a bloquear para permitir el scroll de WordPress
        this.mapaInstancia.on('mouseout', () => {
            if (this.mapaInstancia.scrollWheelZoom) {
                this.mapaInstancia.scrollWheelZoom.disable();
            }
        });
    }
}

// ARRANQUE EN EL ONLOAD DE LA APLICACIÓN WEB
window.onload = () => {
    // Registra el Service Worker de forma segura si el navegador lo soporta
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./js/sw.js')
        .then((registration) => {
            console.log('Servicio de Caché (Service Worker) activo con éxito en el ámbito:', registration.scope);
        })
        .catch((error) => {
            console.error('Fallo al inicializar el servicio de caché offline:', error);
        });
    }

    // Instancia el mapa estructurado en POO
    const app = new SocialWaterMap();
    app.init();
};