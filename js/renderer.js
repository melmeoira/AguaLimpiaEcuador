import { LeafletMap, TileLayer, GeoJSON, CircleMarker, LayerGroup, DivIcon, Marker } from 'leaflet';

class SocialWaterMap {
    // Propiedades estáticas de configuración de la clase
    static LIMITES_CONTINENTE = [
        [-5.01, -81.10],
        [1.45, -75.15]
    ];

    static OPCIONES_ENCUADRE = {
        padding: { x: 30, y: 30 },
        maxZoom: 7
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

        // Encuadre continental inicial óptimo
        this.mapaInstancia.fitBounds(SocialWaterMap.LIMITES_CONTINENTE, SocialWaterMap.OPCIONES_ENCUADRE);

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
                    `<p style="margin: 0 0 3px 0; font-size: 11px;"><b>Coordenadas (lat/lon):</b> (${comunidad.coordenadas[0].toFixed(5)}, ${comunidad.coordenadas[1].toFixed(5)})</p>
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
        document.getElementById('count-Todas').textContent = `(${totales.Todas})`;
        document.getElementById('count-recup').textContent = `(${totales.recup})`;
        document.getElementById('count-Alerta').textContent = `(${totales.Alerta})`;
        document.getElementById('count-Critica').textContent = `(${totales.Critica})`;
    }

    /**
     * Activa la escucha de los eventos click de los filtros rápidos de estado
     */
    configurarFiltros() {
        const botones = document.querySelectorAll('.btn-filtro');
        botones.forEach(boton => {
            boton.addEventListener('click', (e) => {
                botones.forEach(btn => btn.classList.remove('activo'));
                const botonObjetivo = e.target.closest('.btn-filtro');
                if (botonObjetivo) {
                    botonObjetivo.classList.add('activo');
                    this.filtroActivo = botonObjetivo.getAttribute('data-filtro');
                    this.filtrarYMostrar();
                }
            });
        });
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
                    <p style="margin: 0 0 4px 0; font-size: 0.75rem;">Familias: <b>${comunidad.numFamilias || 0}</b></p>
                    <p style="margin: 0 0 8px 0; font-size: 0.75rem; color: #caf0f8;">Filtros entregados: <b>${comunidad.tieneFiltro || 'No'}</b></p>
                    <div class="indicador">
                        <!--<span>pH: <b>${comunidad.ph}</b></span> | <span>Turbidez: <b>${comunidad.turbidez}</b></span>-->
                    </div>`;

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