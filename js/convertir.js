import fs from 'fs';
import proj4 from 'proj4';
import { reproject } from 'reproject';

// 1. Definimos las proyecciones geográficas
// EPSG:32717 es UTM Zona 17S (El estándar métrico en metros oficial para el Ecuador Continental)
const projOrigen = "+proj=utm +zone=17 +south +datum=WGS84 +units=m +no_defs";
// EPSG:4326 es WGS 84 (El estándar global en grados decimales exigido por Leaflet)
const projDestino = "+proj=longlat +datum=WGS84 +no_defs";

function transformarRios() {
    try {
        console.log("Leyendo archivo original 'rios.geojson'...");
        
        // 2. Leer el archivo desalineado con las coordenadas en metros
        const archivoRaw = fs.readFileSync('rios.geojson', 'utf8');
        const geojsonOriginal = JSON.parse(archivoRaw);

        console.log("Reproyectando coordenadas matemáticas a grados decimales...");

        // 3. Ejecutar la reproyección del FeatureCollection completo
        const geojsonCorregido = reproject(geojsonOriginal, projOrigen, projDestino, proj4);

        // 4. Guardar el archivo exportado listo para tu mapa de Leaflet
        fs.writeFileSync(
            'rios_corregidos.geojson', 
            JSON.stringify(geojsonCorregido, null, 2), 
            'utf8'
        );

        console.log("¡Conversión completada con éxito! Se ha generado 'rios_corregidos.geojson'.");
        console.log("Ya puedes borrar el archivo temporal 'convertir.js'.");

    } catch (error) {
        console.error("Error durante la reproyección del archivo:", error);
    }
}

transformarRios();
