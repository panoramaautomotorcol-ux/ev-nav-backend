
// ===== OCM mapping helpers =====
function codeFromOcm(c) {
  const title = String(c?.ConnectionType?.Title || '').toLowerCase();
  const id = c?.ConnectionTypeID;
  if (title.includes('combo') || title.includes('ccs')) {
    if (title.includes('type 1') || title.includes('j1772') || String(id) === '33') return 'ccs1';
    if (title.includes('type 2') || title.includes('mennekes') || String(id) === '32') return 'ccs2';
    return 'ccs';
  }
  if (title.includes('chademo')) return 'chademo';
  if (title.includes('gb/t') || title.includes('gbt') || title.includes('gb-t')) return 'gbt';
  if (title.includes('type 2') || title.includes('mennekes')) return 'type2';
  if (title.includes('type 1') || title.includes('j1772')) return 'type1';
  const curr = String(c?.CurrentType?.Title || '').toUpperCase();
  return curr.includes('DC') ? 'dc_unknown' : 'ac_unknown';
}

function mapOcmPoiToOurFormat(p) {
  const ai = p?.AddressInfo || {};
  const connections = Array.isArray(p?.Connections) ? p.Connections : [];
  const conns = connections.map(c => {
    const currTitle = String(c?.CurrentType?.Title || '').toUpperCase();
    return {
      code: codeFromOcm(c),
      type: c?.ConnectionType?.Title || '',
      power_kw: typeof c?.PowerKW === 'number' ? c.PowerKW : null,
      current: currTitle.includes('DC') ? 'DC' : 'AC',
      quantity: typeof c?.Quantity === 'number' ? c.Quantity : 1
    };
  });

  return {
    id: p?.ID ? `ocm:${p.ID}` : undefined,
    name: ai?.Title || '',
    address: [ai?.AddressLine1, ai?.Town, ai?.StateOrProvince].filter(Boolean).join(', '),
    lat: ai?.Latitude,
    lon: ai?.Longitude,
    provider: 'ocm',
    connectors: conns
  };
}

// server.cjs
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

// ==================== CALIBRACIÓN COLABORATIVA ====================
const calibrationReports = []; // En producción: usar base de datos

// ==================== PERFILES DE VEHÍCULOS ====================
const VEHICLE_PROFILES = {
  'hyundai_kona_48': { batteryKwh: 48.6, consumptionRate: 0.27 },
  'jeep_avenger_54': { batteryKwh: 54.0, consumptionRate: 0.25 },
  'peugeot_e2008_54': { batteryKwh: 54.0, consumptionRate: 0.25 },
  'deepal_s05_e_max_56': { batteryKwh: 56.0, consumptionRate: 0.22 },
  'deepal_s07_79': { batteryKwh: 79.4, consumptionRate: 0.18 },
  'gwm_ora_03_gt_63': { batteryKwh: 63.2, consumptionRate: 0.24 },
  'gwm_ora_03_47': { batteryKwh: 47.8, consumptionRate: 0.32 },
  'mini_contryman_se_64': { batteryKwh: 64.6, consumptionRate: 0.23 },
  'mini_cooper_classic_36': { batteryKwh: 36.6, consumptionRate: 0.33 },
  'chery_eq7_65': { batteryKwh: 65.5, consumptionRate: 0.2 },
  'chery_icar_03_all_road_69': { batteryKwh: 69.77, consumptionRate: 0.24 },
  'chery_icar_03_2wd_65': { batteryKwh: 65.7, consumptionRate: 0.24 },
  'chevrolet_equinox_85': { batteryKwh: 85.0, consumptionRate: 0.15 },
  'chevrolet_spark_ev_41': { batteryKwh: 41.9, consumptionRate: 0.34 },
  'chevrolet_blazer_ev_85': { batteryKwh: 85.0, consumptionRate: 0.17 },
  'jac_e30x_41': { batteryKwh: 41.0, consumptionRate: 0.25 },
  'jac_e10x_31': { batteryKwh: 31.4, consumptionRate: 0.33 },
  'jac_e40x_55': { batteryKwh: 55.0, consumptionRate: 0.25 },
  'mg_marvel_4x4_72': { batteryKwh: 72.2, consumptionRate: 0.27 },
  'mg_marvel_4x2_72': { batteryKwh: 72.2, consumptionRate: 0.25 },
  'mg_cyberster_77': { batteryKwh: 77.0, consumptionRate: 0.23 },
  'mg_s5_49': { batteryKwh: 49.0, consumptionRate: 0.29 },
  'mg_zs_51': { batteryKwh: 51.0, consumptionRate: 0.31 },
  'mg_4_49': { batteryKwh: 49.0, consumptionRate: 0.3, weightKg: 1655 },
  'bmw_i7_105': { batteryKwh: 105.7, consumptionRate: 0.18 },
  'bmw_i5_81': { batteryKwh: 81.2, consumptionRate: 0.2 },
  'bmw_i4_80': { batteryKwh: 80.7, consumptionRate: 0.17 },
  'bmw_ix2_66': { batteryKwh: 66.5, consumptionRate: 0.23 },
  'bmw_ix1_64': { batteryKwh: 64.7, consumptionRate: 0.23 },
  'jmev_gse_luxury_63': { batteryKwh: 63.0, consumptionRate: 0.2 },
  'jmev_gse_comfort_49': { batteryKwh: 49.0, consumptionRate: 0.25 },
  'jmev_3_plus_30': { batteryKwh: 30.24, consumptionRate: 0.31 },
  'jmev_3_31': { batteryKwh: 31.15, consumptionRate: 0.31 },
  'jmev_2_15': { batteryKwh: 15.86, consumptionRate: 0.5 },
  'audi_q6_tech_pro_100': { batteryKwh: 100.0, consumptionRate: 0.16 },
  'audi_q6_sportback_100': { batteryKwh: 100.0, consumptionRate: 0.19 },
  'audi_a6_100': { batteryKwh: 100.0, consumptionRate: 0.14 },
  'audi_q6_e_tron_45_100': { batteryKwh: 100.0, consumptionRate: 0.19 },
  'audi_q6_e_tron_s_line_100': { batteryKwh: 100.0, consumptionRate: 0.16 },
  'audi_q6_e_tron_55s_line_100': { batteryKwh: 100.0, consumptionRate: 0.16 },
  'gac_aion_es_55': { batteryKwh: 55.2, consumptionRate: 0.23 },
  'gac_aion_y_63': { batteryKwh: 63.2, consumptionRate: 0.2 },
  'gac_aion_v_600_75': { batteryKwh: 75.25, consumptionRate: 0.17 },
  'gac_aion_v_500_64': { batteryKwh: 64.5, consumptionRate: 0.2 },
  'gac_aion_ut_44': { batteryKwh: 44.0, consumptionRate: 0.25 },
  'gac_hypetec_ht_72': { batteryKwh: 72.7, consumptionRate: 0.19 },
  'kia_ev3_ligth_81': { batteryKwh: 81.4, consumptionRate: 0.17 },
  'kia_ev3_ligth_58': { batteryKwh: 58.3, consumptionRate: 0.23 },
  'kia_ev5_wind_88': { batteryKwh: 88.1, consumptionRate: 0.18 },
  'kia_ev5_light_64': { batteryKwh: 64.2, consumptionRate: 0.25 },
  'kia_ev6_84': { batteryKwh: 84.0, consumptionRate: 0.17 },
  'kia_ev9_99': { batteryKwh: 99.8, consumptionRate: 0.2 },
  'volvo_ec_40_ultra_78': { batteryKwh: 78.0, consumptionRate: 0.19 },
  'volvo_ex_90_plus_111': { batteryKwh: 111.0, consumptionRate: 0.17 },
  'volvo_ex_40_plus_69': { batteryKwh: 69.0, consumptionRate: 0.21 },
  'volvo_ex_30_ultra_69': { batteryKwh: 69.0, consumptionRate: 0.21 },
  'volvo_ex_30_plus_69': { batteryKwh: 69.0, consumptionRate: 0.21 },
  'volvo_ex_30_core_51': { batteryKwh: 51.0, consumptionRate: 0.29 },
  'zeerk_x_sport_51': { batteryKwh: 51.0, consumptionRate: 0.3 },
  'zeerk_1_flagship_100': { batteryKwh: 100.0, consumptionRate: 0.17 },
  'zeerk_7x_flagship_awd_100': { batteryKwh: 100.0, consumptionRate: 0.18 },
  'zeerk_7x_premium_rwd_100': { batteryKwh: 100.0, consumptionRate: 0.16 },
  'zeerk_7x_sport_75': { batteryKwh: 75.0, consumptionRate: 0.21 },
  'zeerk_1_sport_100': { batteryKwh: 100.0, consumptionRate: 0.16 },
  'byd_seagull_400_38': { batteryKwh: 38.0, consumptionRate: 0.25 },
  'byd_seagull_300_30': { batteryKwh: 30.0, consumptionRate: 0.33 },
  'byd_dolphin_44': { batteryKwh: 44.9, consumptionRate: 0.25 },
  'byd_yuan_up_45': { batteryKwh: 45.0, consumptionRate: 0.26 },
  'byd_yuan_plus_60': { batteryKwh: 60.48, consumptionRate: 0.21 },
  'byd_song_plus_71': { batteryKwh: 71.8, consumptionRate: 0.25 },
  'byd_sealion_7_82': { batteryKwh: 82.5, consumptionRate: 0.22 },
  'byd_tang_108': { batteryKwh: 108.8, consumptionRate: 0.19 },
  'geely_ex2_pro_39': { batteryKwh: 39.4, consumptionRate: 0.25 },
  'geely_ex2_max_39': { batteryKwh: 39.4, consumptionRate: 0.25 },
  'geely_ex5_pro_60': { batteryKwh: 60.22, consumptionRate: 0.23 },
  'geely_ex5_max_60': { batteryKwh: 60.22, consumptionRate: 0.24 },
  'tesla_model_3_rwd_60': { batteryKwh: 60.0, consumptionRate: 0.19 },
  'tesla_model_3_long_range_75': { batteryKwh: 75.0, consumptionRate: 0.15 },
  'tesla_model_3_performance_75': { batteryKwh: 75.0, consumptionRate: 0.18 },
  'tesla_model_y_rwd_60': { batteryKwh: 60.0, consumptionRate: 0.21 },
  'tesla_model_y_long_range_75': { batteryKwh: 75.0, consumptionRate: 0.17 },
  'renault_kwid_26': { batteryKwh: 26.8, consumptionRate: 0.34 },
  'renault_megane_60': { batteryKwh: 60.0, consumptionRate: 0.22 },
  'smart_3_pro_49': { batteryKwh: 49.0, consumptionRate: 0.31 },
  'smart_3_pro_66': { batteryKwh: 66.0, consumptionRate: 0.23 },
  'smart_3_brabus_66': { batteryKwh: 66.0, consumptionRate: 0.24 },
  'smart_1_pure_49': { batteryKwh: 49.0, consumptionRate: 0.32 },
  'smart_1_pro_66': { batteryKwh: 66.0, consumptionRate: 0.24 },
  'smart_1_brabus_66': { batteryKwh: 66.0, consumptionRate: 0.25 },
  'voyah_courage_80': { batteryKwh: 80.0, consumptionRate: 0.16 },
  'generic': { batteryKwh: 60, consumptionRate: 0.28 },
};


function getVehicleProfile(vehicleId) {
  return VEHICLE_PROFILES[vehicleId] || VEHICLE_PROFILES['generic'];
}

const os = require('os');
const flex = require('@here/flexpolyline');
const fs = require('fs');    

const app = express();

// Crear servidor HTTP
const httpServer = http.createServer(app);

// Configurar Socket.io con CORS
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Permitir todas las conexiones (ajusta en producción)
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Manejar conexiones de WebSocket
io.on('connection', (socket) => {
  console.log(`[WS] Cliente conectado: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`[WS] Cliente desconectado: ${socket.id}`);
  });
});

// ===== CACHÉ DE BÚSQUEDAS =====
const searchCache = new Map();
const SEARCH_CACHE_TTL = 10 * 60 * 1000; // 10 minutos

// Limpiar caché cada hora
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, value] of searchCache.entries()) {
    if (now - value.timestamp > SEARCH_CACHE_TTL) {
      searchCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[CACHE] Limpiados ${cleaned} búsquedas. Caché actual: ${searchCache.size}`);
  }
}, 60 * 60 * 1000); // Cada hora

// ===== CACHÉ DE ELEVACIÓN =====
const elevationCache = new Map();
const ELEVATION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

// Limpiar caché de elevación cada 6 horas
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, value] of elevationCache.entries()) {
    if (now - value.timestamp > ELEVATION_CACHE_TTL) {
      elevationCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[CACHE-ELEVATION] Limpiados ${cleaned} perfiles`);
  }
}, 6 * 60 * 60 * 1000); // Cada 6 horas

// ===== BASE DE DATOS DE PEAJES =====
// fs ya está declarado arriba
let peajesData = { peajes: [] };

try {
  const peajesPath = path.join(__dirname, 'peajes_colombia.json');
  if (fs.existsSync(peajesPath)) {
    peajesData = JSON.parse(fs.readFileSync(peajesPath, 'utf8'));
    console.log(`[PEAJES] ✅ Cargados ${peajesData.peajes.length} peajes`);
  } else {
    console.log('[PEAJES] ⚠️  Archivo peajes_colombia.json no encontrado');
  }
} catch (error) {
  console.log('[PEAJES] ❌ Error cargando peajes:', error.message);
}

/**
 * Calcula si un peaje está cerca de la ruta
 * @param {number} peajeLat - Latitud del peaje
 * @param {number} peajeLon - Longitud del peaje
 * @param {Array} routePoints - Puntos de la ruta [{lat, lon}]
 * @param {number} threshold - Distancia máxima en km (default 1km)
 * @returns {boolean}
 */
function isPeajeOnRoute(peajeLat, peajeLon, routePoints, threshold = 1.0) {
  for (const point of routePoints) {
    const distance = haversineDistance(peajeLat, peajeLon, point.lat, point.lon);
    if (distance <= threshold) {
      return true;
    }
  }
  return false;
}

/**
 * Calcula distancia haversine entre dos puntos
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ===== DENSIFICACIÓN DE RUTA (FIX 15) =====
// Interpolar puntos entre dos coordenadas
function interpolatePoints(p1, p2, numPoints = 3) {
  const result = [];
  for (let i = 1; i <= numPoints; i++) {
    const ratio = i / (numPoints + 1);
    result.push({
      lat: +(p1.lat + (p2.lat - p1.lat) * ratio).toFixed(6),
      lon: +(p1.lon + (p2.lon - p1.lon) * ratio).toFixed(6)
    });
  }
  return result;
}

// Densificar ruta agregando puntos intermedios
function densifyRoute(points, targetPointsPerKm = 40) {
  if (points.length < 2) return points;
  const densified = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const R = 6371000;
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lon - p1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distMeters = R * c;
    const distKm = distMeters / 1000;
    const numToAdd = Math.floor(distKm * targetPointsPerKm);
    if (numToAdd > 0 && numToAdd < 50) {
      const interpolated = interpolatePoints(p1, p2, numToAdd);
      densified.push(...interpolated);
    }
    densified.push(p2);
  }
  return densified;
}
// ==================== GOOGLE MAPS INTEGRATION ====================

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

/**
 * Decodificar polyline de Google (formato diferente a HERE)
 */
function decodeGooglePolyline(encoded) {
  const poly = [];
  let index = 0, len = encoded.length;
  let lat = 0, lng = 0;

  while (index < len) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    poly.push({
      lat: (lat / 1e5),
      lon: (lng / 1e5)
    });
  }
  return poly;
}

/**
 * Calcular ruta usando Google Maps Directions API
 */
async function calculateRouteGoogle(origin, destination, waypoints = null, vehicleId = 'generic') {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('GOOGLE_MAPS_API_KEY no configurada');
  }

  console.log('[GOOGLE] 🗺️  Calculando ruta con Google Maps');
  console.log('[GOOGLE]   Origen:', origin);
  console.log('[GOOGLE]   Destino:', destination);
  console.log('[GOOGLE]   Waypoints:', waypoints || 'ninguno');

  const params = {
    origin: origin,
    destination: destination,
    departure_time: 'now',  // ✅ Tráfico en tiempo real
    traffic_model: 'best_guess', // ✅ Mejor predicción
    alternatives: false,
    language: 'es',
    units: 'metric',
    key: GOOGLE_MAPS_API_KEY
  };

  // Agregar waypoints si existen
  if (waypoints) {
    const waypointsList = waypoints.split('|');
    params.waypoints = waypointsList.join('|');
    console.log('[GOOGLE] 📍 Waypoints agregados:', waypointsList.length);
  }

  let response;
  try {
    response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
      params,
      timeout: 15000
    });
  } catch (error) {
    console.error('[GOOGLE] ❌ Error llamando a Google Maps:', error.message);
    throw error;
  }

  const data = response.data;

  if (data.status !== 'OK') {
    console.error('[GOOGLE] ❌ Google Maps error:', data.status, data.error_message);
    throw new Error(`Google Maps error: ${data.status}`);
  }

  const route = data.routes[0];
  const leg = route.legs[0];

  console.log('[GOOGLE] ✅ Ruta recibida de Google Maps');

  // Decodificar polyline DETALLADA desde cada step (no overview que simplifica y cruza casas)
  let points = [];
  
  // Intentar construir polyline desde steps individuales (más detallada)
  let usedStepPolylines = false;
  if (leg.steps && leg.steps.length > 0) {
    for (const step of leg.steps) {
      if (step.polyline && step.polyline.points) {
        const stepPoints = decodeGooglePolyline(step.polyline.points);
        if (stepPoints.length > 0) {
          // Evitar duplicar el punto de unión entre steps
          if (points.length > 0 && stepPoints.length > 0) {
            const lastPt = points[points.length - 1];
            const firstPt = stepPoints[0];
            if (Math.abs(lastPt.lat - firstPt.lat) < 0.00001 && 
                Math.abs(lastPt.lon - firstPt.lon) < 0.00001) {
              points.push(...stepPoints.slice(1));
            } else {
              points.push(...stepPoints);
            }
          } else {
            points.push(...stepPoints);
          }
        }
      }
    }
    usedStepPolylines = points.length > 10;
  }
  
  // Fallback: usar overview_polyline si no se pudieron extraer de los steps
  if (!usedStepPolylines) {
    const polylineEncoded = route.overview_polyline.points;
    points = decodeGooglePolyline(polylineEncoded);
    console.log('[GOOGLE] ⚠️ Usando overview_polyline (fallback)');
  } else {
    console.log('[GOOGLE] ✅ Polyline construida desde steps (detallada)');
  }

  console.log('[GOOGLE] 📊 Puntos originales:', points.length);

  // Densificar ruta (40 metros entre puntos)
  points = densifyRoute(points, 40);
  console.log('[GOOGLE] 🔢 Puntos densificados:', points.length);

  // ============================================================
  // 🆕 NUEVO: Procesar steps con tráfico
  // ============================================================
  const steps = [];
  let currentOffset = 0;

  for (const step of leg.steps) {
    // Limpiar HTML de las instrucciones
    const cleanText = step.html_instructions
      .replace(/<[^>]*>/g, '')  // Quitar tags HTML
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .trim();

    if (!cleanText) continue;

    // ✅ NUEVO: Extraer datos de tráfico
    const distanceMeters = step.distance.value;
    const durationSeconds = step.duration.value; // Sin tráfico
    const durationTrafficSeconds = step.duration_in_traffic?.value || durationSeconds; // ✅ CON tráfico

    // Calcular velocidad real (con tráfico)
    const distanceKm = distanceMeters / 1000;
    const durationHours = durationTrafficSeconds / 3600;
    const speedKmh = durationHours > 0 ? distanceKm / durationHours : 0;

    // Determinar nivel de tráfico según velocidad
    let trafficLevel = 'free';
    if (speedKmh < 10) {
      trafficLevel = 'heavy';      // 🔴 Rojo - Congestionado
    } else if (speedKmh < 20) {
      trafficLevel = 'moderate';   // 🟠 Naranja - Moderado
    } else if (speedKmh < 40) {
      trafficLevel = 'slow';       // 🟡 Amarillo - Lento
    }

    // Encontrar índices en la polyline densificada
    const startLat = step.start_location.lat;
    const startLng = step.start_location.lng;
    const endLat = step.end_location.lat;
    const endLng = step.end_location.lng;

    const fromIdx = findClosestPointIndex(points, startLat, startLng);
    const toIdx = findClosestPointIndex(points, endLat, endLng);

    steps.push({
      text: cleanText,
      offset: currentOffset,
      length_m: distanceMeters,
      
      // ✅ NUEVOS CAMPOS DE TRÁFICO
      distance: distanceMeters,           // metros
      duration: durationSeconds,          // segundos SIN tráfico
      duration_traffic: durationTrafficSeconds, // ✅ segundos CON tráfico
      speed_kmh: Math.round(speedKmh),    // ✅ velocidad real
      traffic_level: trafficLevel,        // ✅ free, slow, moderate, heavy
      fromIdx: fromIdx,                   // ✅ índice inicio en polyline
      toIdx: toIdx                        // ✅ índice fin en polyline
    });

    currentOffset += distanceMeters;
  }

  console.log('[GOOGLE] 📋 Steps generados:', steps.length);
  console.log('[GOOGLE] 🚦 Tráfico por step:', steps.map(s => s.traffic_level).join(', '));
  
  if (steps.length > 0) {
    console.log('[GOOGLE] 📍 Primera instrucción:', steps[0].text);
    console.log('[GOOGLE] 📍 Última instrucción:', steps[steps.length - 1].text);
  }

  // Duración total con tráfico
  const durationSeconds = leg.duration_in_traffic 
    ? leg.duration_in_traffic.value 
    : leg.duration.value;

  const distanceMeters = leg.distance.value;

  console.log('[GOOGLE] 📊 Distancia:', (distanceMeters / 1000).toFixed(1), 'km');
  console.log('[GOOGLE] ⏱️  Duración con tráfico:', Math.round(durationSeconds / 60), 'min');
  
  // ✅ NUEVO: Log de resumen de tráfico
  const hasTrafficData = !!leg.duration_in_traffic;
  const delayMinutes = hasTrafficData 
    ? (leg.duration_in_traffic.value - leg.duration.value) / 60 
    : 0;
  
  console.log('[GOOGLE] 🚦 Datos de tráfico:', hasTrafficData ? 'SÍ' : 'NO');
  if (hasTrafficData) {
    console.log('[GOOGLE] ⏳ Retraso por tráfico:', delayMinutes.toFixed(1), 'min');
  }

  return {
    points,
    steps,  // ✅ Ahora incluye datos de tráfico por step
    distanceMeters,
    durationSeconds,
    provider: 'google',
    
    // ✅ NUEVO: Metadata de tráfico
    traffic_summary: {
      has_traffic_data: hasTrafficData,
      free_flow_duration_min: leg.duration.value / 60,
      traffic_duration_min: durationSeconds / 60,
      delay_minutes: delayMinutes
    }
  };
}

// ============================================================
// 🆕 NUEVA FUNCIÓN HELPER: Encontrar punto más cercano
// ============================================================
function findClosestPointIndex(points, targetLat, targetLng) {
  let minDist = Infinity;
  let closestIdx = 0;
  
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const lat = point.lat;
    const lon = point.lon || point.lng;
    
    // Distancia simple (Pitágoras - suficiente para distancias cortas)
    const dist = Math.sqrt(
      Math.pow(lat - targetLat, 2) + 
      Math.pow(lon - targetLng, 2)
    );
    
    if (dist < minDist) {
      minDist = dist;
      closestIdx = i;
    }
  }
  
  return closestIdx;
}


/**
 * Sistema de caché de rutas
 */
const routeCache = new Map();
const ROUTE_CACHE_TTL = 15 * 60 * 1000; // 15 minutos

function getCacheKey(origin, destination, waypoints) {
  return `${origin}_${destination}_${waypoints || 'direct'}`;
}

function getCachedRoute(origin, destination, waypoints) {
  const key = getCacheKey(origin, destination, waypoints);
  const cached = routeCache.get(key);
  
  if (cached && Date.now() - cached.timestamp < ROUTE_CACHE_TTL) {
    console.log('[CACHE] ⚡ Cache HIT:', key);
    return cached.data;
  }
  
  return null;
}

function setCachedRoute(origin, destination, waypoints, data) {
  const key = getCacheKey(origin, destination, waypoints);
  routeCache.set(key, {
    data,
    timestamp: Date.now()
  });
  console.log('[CACHE] 💾 Ruta guardada en caché:', key);
}

// Limpiar caché cada hora
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, value] of routeCache.entries()) {
    if (now - value.timestamp > ROUTE_CACHE_TTL) {
      routeCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[CACHE] 🧹 Limpiados ${cleaned} rutas expiradas`);
  }
}, 60 * 60 * 1000);




// ==================== ENV ====================
let PORT = Number(process.env.PORT || 3000);
const HERE_API_KEY     = process.env.HERE_API_KEY     || '';
const MAPTILER_KEY     = process.env.MAPTILER_KEY     || '';
const MAPBOX_TOKEN     = process.env.MAPBOX_TOKEN     || '';
console.log('[ENV] GOOGLE_MAPS_API_KEY len =', (GOOGLE_MAPS_API_KEY || '').length);
const TRAFFIC_TTL_MS   = Number(process.env.TRAFFIC_TTL_MS || 60_000);
const OCM_API_KEY      = process.env.OCM_API_KEY      || '';
const EV_COUNTRY_CODE  = process.env.EV_COUNTRY_CODE  || 'CO';
const OCM_ASSUME_CCS2  = String(process.env.OCM_ASSUME_CCS2 || '') === '1'; // ⚙️ heurística DC→CCS2

console.log('[ENV] HERE_API_KEY len =', (HERE_API_KEY || '').length);
console.log('[ENV] MAPTILER_KEY len =', (MAPTILER_KEY || '').length);
console.log('[ENV] OCM_API_KEY set =', !!OCM_API_KEY);
console.log('[ENV] OCM_ASSUME_CCS2 =', OCM_ASSUME_CCS2);
if (!MAPTILER_KEY) console.warn('⚠️  Falta MAPTILER_KEY (MapTiler geocoding)');
if (!HERE_API_KEY) console.warn('⚠️  Falta HERE_API_KEY (autosuggest/revgeocode/rutas/tráfico)');

// Puerto libre automático
const tried = new Set();
const pickPort = async () => {
  const http = require('http');
  while (true) {
    if (tried.has(PORT)) { PORT++; continue; }
    tried.add(PORT);
    const srv = http.createServer(()=>{});
    try {
      await new Promise((res, rej) => srv.listen(PORT, '0.0.0.0', res).once('error', rej));
      await new Promise(r => srv.close(r));
      return PORT;
    } catch { PORT++; }
  }
};

// ============ Utils ============
// ok/parseBBox/haversine/etc.
const ok = v => v !== undefined && v !== null && v !== '';

function parseBBox(bboxStr) {
  const p = String(bboxStr||'').split(',').map(Number);
  if (p.length < 4 || p.some(x => !Number.isFinite(x))) return null;
  const [w,s,e,n] = p; return { w,s,e,n };
}

// Componer "Calle … # …"
function composeAddressName({ street, house, fullLabel }) {
  const clean = s => String(s || '').trim();
  street = clean(street); house = clean(house); fullLabel = clean(fullLabel);
  if (street && house) return `${street} # ${house}`;
  if (street && !house) return street;
  if (house && !street && fullLabel) {
    const m = fullLabel.match(/,\s*([^,]*(?:Calle|Carrera|Cra\.?|KR|Av(?:enida)?|Diagonal|Transversal|Tv|Trv)[^,]*)/i);
    if (m && m[1]) return `${m[1].trim()} # ${house}`;
  }
  return fullLabel || street || house || '';
}

// Extraer vía principal
function extractRoadFromLabel(label='') {
  const m = String(label).match(/\b(Calle|Carrera|Cra\.?|KR|Av(?:enida)?|Diagonal|Transversal|Tv|Trv)\s*[^,]*/i);
  return m ? m[0].replace(/\s+/g,' ').trim() : '';
}
function pickLocalityFrom(obj={}) {
  return obj.neighbourhood || obj.suburb || obj.district || obj.locality || obj.city || obj.town || obj.county || '';
}

// ===== Flexible Polyline -> [{lat, lon}]
function decodeFlexToPoints(polyStr) {
  if (!polyStr || typeof polyStr !== 'string') return [];
  try {
    const decoded = flex.decode(polyStr);
    if (Array.isArray(decoded)) return decoded.map(([lat, lon]) => ({ lat:+(+lat).toFixed(6), lon:+(+lon).toFixed(6) }));
    const coords = decoded?.coordinates || decoded?.polyline || decoded?.points || decoded?.coords || null;
    if (Array.isArray(coords)) return coords.map(([lat, lon]) => ({ lat:+(+lat).toFixed(6), lon:+(+lon).toFixed(6) }));
  } catch {}
  try { // fallback simple
    let i=0;
    const u=()=>{let r=0,s=0,b;do{b=polyStr.charCodeAt(i++)-63;r|=(b&0x1f)<<s;s+=5;}while(b>=0x20);return r;};
    const s=v=>(v&1)?~(v>>1):(v>>1);
    const h=u(); let val=h; const prec=(val&15); val>>=4; const third=val&7; const factor=Math.pow(10,prec);
    let la=0,lo=0,out=[];
    while(i<polyStr.length){ let v=u(); la+=s(v); v=u(); lo+=s(v); if(third) s(u()); out.push({lat:+(la/factor).toFixed(6), lon:+(lo/factor).toFixed(6)}); }
    return out;
  } catch { return []; }
}

// Haversine km
const havKm = (a,b,c,d) => {
  const R=6371, dLat=(c-a)*Math.PI/180, dLon=(d-b)*Math.PI/180;
  const s1=Math.sin(dLat/2)**2, s2=Math.sin(dLon/2)**2;
  const A=s1+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*s2;
  return R*2*Math.atan2(Math.sqrt(A),Math.sqrt(1-A));
};

const bboxAround = (lat,lon,km=12) => {
  const dLat = km/111;
  const dLon = km/(111*Math.cos((lat||0)*Math.PI/180));
  const w = lon-dLon, e = lon+dLon, s = lat-dLat, n = lat+dLat;
  return `${w.toFixed(5)},${s.toFixed(5)},${e.toFixed(5)},${n.toFixed(5)}`;
};

// --- Normalización de conectores (Colombia) ---
function classifyConnectorName(name='') {
  const s = String(name).toLowerCase().replace(/\s+/g,' ').trim();
  const has = (rx) => rx.test(s);
  const isDC = has(/\bdc\b|carga\s*rápida|carga\s*rapida|rápida|rapida/);

  if (has(/\b(j1772|type\s*1|tipo\s*1|yazaki)\b/)) return { code:'type1', label:'Tipo 1 (J1772)', kind:'ac' };
  if (has(/\b(ccs\s*1|combo\s*1|sae\s*combo|ccs1)\b/))   return { code:'ccs1',  label:'CCS1', kind:'dc' };
  if (has(/\b(type\s*2|tipo\s*2|mennekes)\b/))          return { code:'type2', label:'Tipo 2 (Mennekes)', kind: isDC ? 'dc' : 'ac' };
  if (has(/\b(ccs\s*2|combo\s*2|ccs2)\b/))              return { code:'ccs2',  label:'CCS2', kind:'dc' };
  if (has(/\b(chademo|cha-de-mo|cha de mo)\b/))         return { code:'chademo', label:'CHAdeMO', kind:'dc' };
  if (has(/\b(gb\/?t|gbt|g b t)\b/))                    return { code:(isDC?'gbtdc':'gbtac'), label:(isDC?'GB/T DC':'GB/T'), kind:(isDC?'dc':'ac') };
  if (has(/\bschuko\b|\bnema\b|domiciliario|hogar|toma\b/))
    return { code:'schuko', label:'Schuko/NEMA', kind:'ac' };
  return { code:'other', label:(name||'Otro'), kind: isDC?'dc':'ac' };
}

function normalizeChargerConnectors(ch) {
  const arr = Array.isArray(ch.connectors) ? ch.connectors : [];

  // Normalizamos cada conector
  const mapped = arr.map(c => {
    const rawName = c.type || c.name || c.connector || '';
    const { code: baseCode, label: baseLabel, kind } = classifyConnectorName(rawName);

    let power = Number(c.power_kw ?? c.powerKW ?? c.power ?? c.kw);
    power = Number.isFinite(power) ? power : null;

    const quantity = Number(c.quantity ?? c.count ?? 1) || 1;
    const current  = (c.current || (kind === 'dc' ? 'DC' : 'AC') || '').toUpperCase();

    // --- precio por kWh a nivel de conector (acepta número o string) ---
    let priceKwh = null;
    if (c.price_kwh_cop !== undefined && c.price_kwh_cop !== null) {
      const p = Number(c.price_kwh_cop);
      if (Number.isFinite(p) && p > 0) priceKwh = p;
    }

    // Si OCM deja "other", etiquetar como ac_unknown/dc_unknown
    let code  = baseCode;
    let label = baseLabel;
    if (code === 'other') {
      if (current === 'DC') { code = 'dc_unknown'; label = 'DC (desconocido)'; }
      else                  { code = 'ac_unknown'; label = 'AC (desconocido)'; }
    }

    return {
      code,
      type: label,
      power_kw: power,
      current,
      quantity,
      price_kwh_cop: priceKwh,
    };
  });

  const codes = [...new Set(mapped.map(m => m.code).filter(Boolean))];

  // Potencia máxima global del sitio
  let maxKw = Number.isFinite(Number(ch.power_kw)) ? Number(ch.power_kw) : null;
  for (const m of mapped) {
    if (Number.isFinite(m.power_kw)) {
      maxKw = Math.max(maxKw ?? 0, m.power_kw);
    }
  }

  // --- rango min/máx de precios del sitio (acepta número o string) ---
  const rawMin =
    ch.min_price_kwh_cop ??
    ch.precio_min_kwh_cop ??
    ch['precio_mín_kwh_cop'] ??
    null;

  const rawMax =
    ch.max_price_kwh_cop ??
    ch.precio_max_kwh_cop ??
    ch['precio_máx_kwh_cop'] ??
    null;

  let minPrice = null;
  let maxPrice = null;

  if (rawMin != null) {
    const p = Number(rawMin);
    if (Number.isFinite(p) && p > 0) minPrice = p;
  }
  if (rawMax != null) {
    const p = Number(rawMax);
    if (Number.isFinite(p) && p > 0) maxPrice = p;
  }

  // Si no hay min/max a nivel de sitio, se derivan de los conectores
  for (const m of mapped) {
    if (typeof m.price_kwh_cop === 'number') {
      const p = m.price_kwh_cop;
      if (minPrice == null || p < minPrice) minPrice = p;
      if (maxPrice == null || p > maxPrice) maxPrice = p;
    }
  }

  // 👇 DEBUG AGREGADO AQUÍ
  console.log('[NORMALIZE]', ch.name, {
    min: minPrice,
    max: maxPrice,
    connectors: mapped.map(c => ({ 
      type: c.type, 
      precio_original: ch.connectors.find(x => x.type === c.type)?.price_kwh_cop,
      precio_mapeado: c.price_kwh_cop 
    }))
  });

  return {
    ...ch,
    power_kw: maxKw,
    connectors: mapped,
    connector_codes: codes,
    min_price_kwh_cop: minPrice,
    max_price_kwh_cop: maxPrice,
  };
}

// Heurísticas para inferir conectores desconocidos
function inferUnknownConnectors(ch) {
  const conns = Array.isArray(ch.connectors) ? ch.connectors.slice() : [];
  for (const c of conns) {
    const code = String(c.code||'');
    const curr = String(c.current||'').toUpperCase();
    const kw   = Number(c.power_kw || ch.power_kw || 0);

    // DC desconocido → CCS2 (si activas la flag)
    if ((code === 'dc_unknown' || /desconocid/i.test(c.type)) && curr === 'DC' && OCM_ASSUME_CCS2) {
      c.code = 'ccs2'; c.type = 'CCS2'; c.current = 'DC'; continue;
    }

    // AC desconocido: ≥ 7kW → Type 2; ≤ 3.7kW → Schuko/NEMA
    if ((code === 'ac_unknown' || /desconocid/i.test(c.type)) && curr === 'AC') {
      if (kw >= 7)      { c.code = 'type2';  c.type = 'Tipo 2 (Mennekes)'; c.current = 'AC'; continue; }
      if (kw > 0 && kw <= 3.7) { c.code = 'schuko'; c.type = 'Schuko/NEMA'; c.current = 'AC'; continue; }
    }
  }
  ch.connectors = conns;
  ch.connector_codes = [...new Set(conns.map(x => x.code).filter(Boolean))];
  return ch;
}

// ==================== EV CHARGERS (local + fallback OCM) ====================
const EV_CACHE_TTL_MS = Number(process.env.EV_CACHE_TTL_MS || 300_000);
const DATA_DIR  = path.join(__dirname, 'data');
const LOCAL_JSON =
  process.env.LOCAL_CHARGERS_JSON ||
  path.join(DATA_DIR, `chargers_${EV_COUNTRY_CODE}.json`);
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

let _evMem = { ts: 0, items: [] };
function _readLocalEv() {
  try {
    const raw = fs.readFileSync(LOCAL_JSON, 'utf8');
    const parsed = JSON.parse(raw);
    const base = Array.isArray(parsed) ? parsed : (parsed.items || []);
    
    // 👇 BUSCA COGUA ESPECÍFICAMENTE
    const cogua = base.find(x => x.name && x.name.includes('Cogua'));
    if (cogua) {
      console.log('[DEBUG COGUA RAW]', JSON.stringify(cogua, null, 2));
    } else {
      console.log('[DEBUG] NO SE ENCONTRÓ COGUA EN EL JSON');
    }
    
    return base.map(normalizeChargerConnectors);
  } catch (e) {
    console.warn('[EV] No pude leer dataset local:', LOCAL_JSON, e.message);
    return [];
  }
}
function _getEvItems() {
  const now = Date.now();
  if (now - _evMem.ts < EV_CACHE_TTL_MS && _evMem.items.length) return _evMem.items;
  _evMem = { ts: now, items: _readLocalEv() };
  return _evMem.items;
}
function _parseBbox(s) {
  const a = (s || '').split(',').map(Number);
  return (a.length === 4 && a.every(Number.isFinite)) ? a : null; // [w,s,e,n]
}
function _inBbox(m, w, s, e, n) {
  return m.lon >= w && m.lon <= e && m.lat >= s && m.lat <= n;
}

// ---- OCM helpers ----
function _normalizeOcmItem(it) {
  const addr = it.AddressInfo || {}; // <-- bugfix: antes no estaba definido

  const connectors = (Array.isArray(it.Connections) ? it.Connections : []).map(c => {
    const typeName =
      c.ConnectionType?.FormalName ||
      c.ConnectionType?.Title ||
      c.ConnectionType?.Comments ||
      c.Comments ||
      '';

    const power =
      (typeof c.PowerKW === 'number' ? c.PowerKW : null) ??
      ((c.Amps && c.Voltage) ? (c.Amps * c.Voltage) / 1000 : null);

    let current = (c.CurrentType?.Title || '').toUpperCase();
    if (!current) current = c.Level?.IsFastChargeCapable ? 'DC' : 'AC';

    const quantity = typeof c.Quantity === 'number' ? c.Quantity : 1;

    return { type: (typeName || '').trim() || 'Desconocido', power_kw: power ?? null, current, quantity };
  });

  const powerKw = connectors.reduce((m, c) => (typeof c.power_kw === 'number' ? Math.max(m ?? 0, c.power_kw) : m), null);

  return {
    id: it.ID ? `ocm:${it.ID}` : `ocm:${Math.random().toString(36).slice(2)}`,
    name: addr.Title || it.OperatorInfo?.Title || 'Punto de carga',
    address: [addr.AddressLine1, addr.AddressLine2, addr.Town, addr.StateOrProvince].filter(Boolean).join(', '),
    lat: Number(addr.Latitude),
    lon: Number(addr.Longitude),
    network: it.OperatorInfo ? (it.OperatorInfo.Title || null) : null,
    status: it.StatusType ? (it.StatusType.IsOperational ? 'Operational' : (it.StatusType.Title || 'Unknown')) : 'Unknown',
    is_operational: it.StatusType ? !!it.StatusType.IsOperational : true,
    last_updated: it.DateLastStatusUpdate || it.DateLastVerified || it.DateLastConfirmed || it.DateCreated || null,
    power_kw: powerKw,
    connectors,
    provider: 'ocm'
  };
}
async function _fetchOcmByBbox({ west, south, east, north, limit = 300 }) {
  const url = 'https://api.openchargemap.io/v3/poi';
  const params = {
    key: OCM_API_KEY || undefined,
    countrycode: EV_COUNTRY_CODE,
    boundingbox: `${south},${west},${north},${east}`, // OCM usa S,W,N,E
    compact: true,
    verbose: false,
    maxresults: String(limit),
  };
  const { data } = await axios.get(url, { params, timeout: 12000 });
  const arr = Array.isArray(data) ? data : [];
  return arr
    .map(_normalizeOcmItem)
    .map(normalizeChargerConnectors)
    .map(inferUnknownConnectors);
}
function _mergeLocalWithOcm(localArr, ocmArr) {
  // Haversine en metros
  const distM = (a,b) => {
    const R=6371000;
    const dLat=(b.lat-a.lat)*Math.PI/180, dLon=(b.lon-a.lon)*Math.PI/180;
    const s1=Math.sin(dLat/2)**2, s2=Math.sin(dLon/2)**2;
    const A=s1+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*s2;
    return R*2*Math.atan2(Math.sqrt(A),Math.sqrt(1-A));
  };

  const THRESHOLD_M = 200; // empareja si están a < 200 m

  return localArr.map(m => {
    const localHasKnown =
      Array.isArray(m.connectors) &&
      m.connectors.some(c => String(c?.type||'').toLowerCase() !== 'desconocido' &&
                             !String(c?.code||'').includes('unknown'));

    if (localHasKnown) return m; // ya conocidos, no tocamos

    // busca el OCM más cercano dentro del umbral
    let best = null, bestD = Infinity;
    for (const o of ocmArr) {
      const d = distM({lat:m.lat,lon:m.lon},{lat:o.lat,lon:o.lon});
      if (d < bestD) { bestD = d; best = o; }
    }

    if (best && bestD <= THRESHOLD_M && Array.isArray(best.connectors) && best.connectors.length) {
      return normalizeChargerConnectors(
        inferUnknownConnectors({
          ...m,
          connectors: best.connectors,
          connector_codes: best.connector_codes,
          power_kw: m.power_kw ?? best.power_kw,
          network: m.network ?? best.network,
          provider: 'local+ocm'
        })
      );
    }
    return m; // sin match cercano, se queda igual
  });
}

// ===== CARGADORES LOCALES (chargers_CO.json) =====================
const _chargersFile = path.join(__dirname, 'data', 'chargers_CO.json');

let _chargersCache = {
  mtimeMs: 0,
  items: [],
};

function getLocalChargers() {
  try {
    const stat = fs.statSync(_chargersFile);
    if (!_chargersCache.items.length || stat.mtimeMs !== _chargersCache.mtimeMs) {
      const raw = fs.readFileSync(_chargersFile, 'utf8');
      const data = JSON.parse(raw);
      _chargersCache = {
        mtimeMs: stat.mtimeMs,
        items: Array.isArray(data) ? data : [],
      };
      console.log('[ev] local chargers reloaded:', _chargersCache.items.length);
    }
    return _chargersCache.items;
  } catch (err) {
    console.error('[ev] error loading local chargers:', err);
    return [];
  }
}

function parseBboxLonLat(str) {
  const parts = String(str || '')
    .split(',')
    .map(p => Number(p.trim()));

  if (parts.length !== 4 || parts.some(v => !Number.isFinite(v))) {
    return null;
  }

  const [w, s, e, n] = parts; // lonW, latS, lonE, latN
  return { w, s, e, n };
}

// SOLO dataset local, filtrado por bbox
// SOLO dataset local, filtrado por bbox
async function handleEvChargers(req, res) {
  try {
    // 1) leemos bbox de la query
    const bboxStr = (req.query.bbox || req.query.bboxLonLat || '')
      .toString()
      .trim();

    const arr = _parseBbox(bboxStr);
    if (!arr) {
      console.warn('[EV] /ev/chargers sin bbox o bbox inválido:', bboxStr);
      return res.status(400).json({ error: 'Missing or invalid bbox' });
    }

    const [w, s, e, n] = arr;
    const limit = Number(req.query.limit || 500);

    // 2) cargamos TODOS los cargadores locales (ya normalizados)
    const local = _getEvItems(); // función que ya tienes arriba

    // 3) filtramos por bbox
    const items = local.filter((p) => {
      const lat = Number(p.lat ?? p.latitude);
      const lon = Number(p.lon ?? p.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
      return lon >= w && lon <= e && lat >= s && lat <= n;
    });

    console.log(
      '[EV] /ev/chargers bbox=%s -> %d items',
      bboxStr,
      items.length
    );

    const sliced = items.slice(0, Math.max(0, limit));

    // 4) respondemos
    return res.json({
      provider: 'local',
      source: 'local',
      count: sliced.length,
      items: sliced,
    });
  } catch (err) {
    console.error('[ev/chargers] local handler error:', err);
    return res.status(500).json({
      error: 'EV chargers failed',
      details: err.message,
    });
  }
}

app.get('/ev/chargers', handleEvChargers);
app.get('/chargers', handleEvChargers);

const availabilityCache = new Map();

// ===== SISTEMA DE COMENTARIOS Y FOTOS =====
// Estructura: siteId -> array de comentarios
const commentsCache = new Map();

// Estructura: siteId -> array de fotos (base64 o URLs)
const photosCache = new Map();

// Configuración
const COMMENTS_CONFIG = {
  MAX_LENGTH: 500,                    // Máximo caracteres por comentario
  MAX_PER_USER_PER_SITE: 3,          // Máximo 3 comentarios por usuario por sitio
  COOLDOWN: 2 * 60 * 1000,           // 2 minutos entre comentarios
  MAX_PHOTOS_PER_COMMENT: 3,         // Máximo 3 fotos por comentario
  PHOTO_MAX_SIZE_MB: 5,              // Máximo 5MB por foto
};

// ===== SISTEMA ANTI-SPAM =====
const userUpdateCache = new Map();

const SPAM_CONFIG = {
  MAX_UPDATES_PER_SITE: 3,
  TIME_WINDOW: 5 * 60 * 1000,
  COOLDOWN_BETWEEN_UPDATES: 30 * 1000,
};

const AVAIL_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

// Limpieza periódica de datos expirados
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of availabilityCache.entries()) {
    if (now - data.timestamp > AVAIL_TTL_MS) {
      availabilityCache.delete(key);
    }
  }
}, 15 * 60 * 1000); // cada 15 min

// ===== ENDPOINT: actualizar disponibilidad =====
app.post('/ev/availability', (req, res) => {
  try {
    const { siteId, connectorType, connectorCurrent, connectorKw, available } = req.body;

    if (!siteId || available === undefined) {
      return res.status(400).json({ error: 'Missing siteId or available' });
    }

    const userIP = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    // Inicializar usuario
    if (!userUpdateCache.has(userIP)) {
      userUpdateCache.set(userIP, new Map());
    }
    
    const userSites = userUpdateCache.get(userIP);
    
    // Verificar rate limits
    if (userSites.has(siteId)) {
      const siteHistory = userSites.get(siteId);
      const lastUpdate = siteHistory.lastUpdate;
      
      // REGLA 1: Cooldown
      if (now - lastUpdate < SPAM_CONFIG.COOLDOWN_BETWEEN_UPDATES) {
        const waitTime = Math.ceil((SPAM_CONFIG.COOLDOWN_BETWEEN_UPDATES - (now - lastUpdate)) / 1000);
        console.log(`[SPAM] Usuario debe esperar ${waitTime}s`);
        return res.status(429).json({ 
          error: 'rate_limit',
          message: `Por favor espera ${waitTime} segundos antes de actualizar este cargador nuevamente`,
          waitSeconds: waitTime
        });
      }
      
      // REGLA 2: Límite en ventana
      const windowStart = now - SPAM_CONFIG.TIME_WINDOW;
      const recentUpdates = siteHistory.updates.filter(t => t > windowStart);
      
      if (recentUpdates.length >= SPAM_CONFIG.MAX_UPDATES_PER_SITE) {
        console.log(`[SPAM] Usuario excedió límite`);
        return res.status(429).json({ 
          error: 'spam_detected',
          message: 'Has alcanzado el límite de actualizaciones para este cargador. Intenta más tarde.',
        });
      }
      
      siteHistory.lastUpdate = now;
      siteHistory.count++;
      siteHistory.updates = [...recentUpdates, now];
    } else {
      userSites.set(siteId, {
        lastUpdate: now,
        count: 1,
        updates: [now]
      });
    }
    
    // Guardar con votación
    const key = `${siteId}|${connectorType}|${connectorCurrent}|${connectorKw}`;
    const autoExpire = available < 2 ? now + AVAIL_TTL_MS : null;
    
    const prevData = availabilityCache.get(key) || {};
    const votes = prevData.votes || [];
    
    votes.push({
      value: available,
      userIP: userIP,
      timestamp: now
    });
    
    const recentVotes = votes.filter(v => now - v.timestamp < 10 * 60 * 1000);
    const avgAvail = Math.round(
      recentVotes.reduce((sum, v) => sum + v.value, 0) / recentVotes.length
    );
    
    availabilityCache.set(key, {
      avail: avgAvail,
      timestamp: now,
      autoExpire: autoExpire,
      votes: recentVotes,
      voteCount: recentVotes.length
    });

    console.log(`[AVAIL] Updated ${key} → ${avgAvail} (${recentVotes.length} votos)${autoExpire ? ' (expira en 2h)' : ''}`);

    // Emitir evento WebSocket a todos los clientes conectados
    io.emit('availability:updated', {
      siteId: siteId,
      connectorType: connectorType,
      connectorCurrent: connectorCurrent,
      connectorKw: connectorKw,
      available: avgAvail,
      voteCount: recentVotes.length
    });

    console.log(`[WS] Evento emitido: availability:updated para ${siteId}`);

    return res.json({ 
      ok: true, 
      key, 
      available: avgAvail,
      voteCount: recentVotes.length
    });
  } catch (e) {
    console.error('[AVAIL] Error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ===== ENDPOINT: agregar comentario =====
app.post('/ev/comments', (req, res) => {
  try {
    const { siteId, text, rating } = req.body;

    if (!siteId || !text) {
      return res.status(400).json({ error: 'Missing siteId or text' });
    }

    // Validar longitud
    if (text.length > COMMENTS_CONFIG.MAX_LENGTH) {
      return res.status(400).json({ 
        error: 'comment_too_long',
        message: `El comentario no puede exceder ${COMMENTS_CONFIG.MAX_LENGTH} caracteres`
      });
    }

    const userIP = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    // Anti-spam: verificar cooldown
    const siteComments = commentsCache.get(siteId) || [];
    const userRecentComments = siteComments.filter(
      c => c.userIP === userIP && (now - c.timestamp) < COMMENTS_CONFIG.COOLDOWN
    );

    if (userRecentComments.length > 0) {
      const waitTime = Math.ceil((COMMENTS_CONFIG.COOLDOWN - (now - userRecentComments[0].timestamp)) / 1000);
      return res.status(429).json({
        error: 'rate_limit',
        message: `Por favor espera ${waitTime} segundos antes de comentar nuevamente`,
        waitSeconds: waitTime
      });
    }

    // Anti-spam: máximo de comentarios por usuario
    const userComments = siteComments.filter(c => c.userIP === userIP);
    if (userComments.length >= COMMENTS_CONFIG.MAX_PER_USER_PER_SITE) {
      return res.status(429).json({
        error: 'max_comments',
        message: 'Has alcanzado el límite de comentarios para este cargador'
      });
    }

    // Crear comentario
    const comment = {
      id: `${siteId}_${now}_${Math.random().toString(36).substr(2, 9)}`,
      text: text.trim(),
      rating: rating ? Math.max(1, Math.min(5, rating)) : null,
      userIP: userIP,
      timestamp: now,
      photos: []
    };

    // Guardar
    siteComments.push(comment);
    commentsCache.set(siteId, siteComments);

    console.log(`[COMMENT] Nuevo comentario en ${siteId}: "${text.substring(0, 50)}..."`);

    // Emitir evento WebSocket
    io.emit('comment:added', {
      siteId: siteId,
      comment: {
        id: comment.id,
        text: comment.text,
        rating: comment.rating,
        timestamp: comment.timestamp,
        photos: comment.photos
      }
    });

    console.log(`[WS] Evento emitido: comment:added para ${siteId}`);

    return res.json({
      ok: true,
      comment: {
        id: comment.id,
        text: comment.text,
        rating: comment.rating,
        timestamp: comment.timestamp
      }
    });

  } catch (e) {
    console.error('[COMMENT] Error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ===== ENDPOINT: obtener comentarios =====
app.get('/ev/comments', (req, res) => {
  try {
    const { siteId } = req.query;

    if (!siteId) {
      return res.status(400).json({ error: 'Missing siteId' });
    }

    const comments = commentsCache.get(siteId) || [];

    // Ordenar por más reciente primero
    const sorted = comments
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(c => ({
        id: c.id,
        text: c.text,
        rating: c.rating,
        timestamp: c.timestamp,
        photos: c.photos,
      }));

    return res.json({
      siteId: siteId,
      comments: sorted,
      count: sorted.length
    });

  } catch (e) {
    console.error('[COMMENT] Error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});



// ===== ENDPOINT: obtener disponibilidad =====
app.get('/ev/availability', (req, res) => {
  try {
    const { siteId } = req.query;
    const now = Date.now();

    if (!siteId) {
      // Devolver todo el caché (filtrado por expiración)
      const all = {};
      for (const [key, data] of availabilityCache.entries()) {
        // Verificar si expiró
        if (data.autoExpire && now > data.autoExpire) {
          availabilityCache.delete(key); // Eliminar expirado
          console.log(`[AVAIL] Auto-expirado: ${key}`);
          continue;
        }
        all[key] = data.avail;
      }
      return res.json(all);
    }

    // Filtrar por siteId
    const filtered = {};
    for (const [key, data] of availabilityCache.entries()) {
      if (key.startsWith(siteId + '|')) {
        // Verificar si expiró
        if (data.autoExpire && now > data.autoExpire) {
          availabilityCache.delete(key);
          console.log(`[AVAIL] Auto-expirado: ${key}`);
          continue;
        }
        filtered[key] = data.avail;
      }
    }

    return res.json(filtered);
  } catch (e) {
    console.error('[AVAIL] Error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ==================== DEBUG ====================
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    providers: { routing: 'HERE', places: 'MT+HERE+Nomi+Overpass', traffic: 'HERE' },
    env: { PORT, hasHere: !!HERE_API_KEY, hasMapTiler: !!MAPTILER_KEY, trafficTTLms: TRAFFIC_TTL_MS }
  });
});
app.get('/debug/keys', (_req, res) => {
  const mask = k => k ? (k.slice(0,4)+'...'+k.slice(-4)) : '';
  res.json({ here: mask(HERE_API_KEY), maptiler: mask(MAPTILER_KEY) });
});

/* ==================== PLACES ==================== */
// ===== ENDPOINT RÁPIDO DE BÚSQUEDA (solo HERE Autosuggest) =====
app.get('/places-fast', async (req, res) => {
  try {
    const { q, at, lang, limit } = req.query;
    
    // Lugares populares si no hay query
    if (!q || q.trim().length === 0) {
      return res.json({
        items: [
          { name: 'Centro Comercial Unicentro', lat: 4.6704, lon: -74.0565, address: 'Calle 127 #15A-24, Bogotá' },
          { name: 'Aeropuerto El Dorado', lat: 4.7016, lon: -74.1469, address: 'Av. El Dorado #103-8, Bogotá' },
          { name: 'Centro Andino', lat: 4.6649, lon: -74.0542, address: 'Carrera 11 #82-71, Bogotá' },
          { name: 'Parque de la 93', lat: 4.6762, lon: -74.0485, address: 'Calle 93A, Bogotá' },
          { name: 'Usaquén', lat: 4.7026, lon: -74.0309, address: 'Localidad de Usaquén' },
          { name: 'Plaza de Bolívar', lat: 4.5981, lon: -74.0758, address: 'Carrera 7 #11-10, Bogotá' },
          { name: 'Salitre Plaza', lat: 4.6541, lon: -74.1036, address: 'Carrera 68C #24B-60, Bogotá' },
          { name: 'Centro Comercial Titán Plaza', lat: 4.6956, lon: -74.0871, address: 'Calle 80 #69A-50, Bogotá' },
        ]
      });
    }
    
    const query = q.trim();
    const cacheKey = `fast_${query.toLowerCase()}_${at}`;
    
    // Verificar caché
    const cached = searchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < SEARCH_CACHE_TTL) {
      console.log(`[SEARCH-FAST] ⚡ Cache HIT: "${query}"`);
      return res.json(cached.data);
    }
    
    console.log(`[SEARCH-FAST] 🔍 Buscando: "${query}"`);
    const startTime = Date.now();
    
    if (!HERE_API_KEY) {
      return res.json({ items: [] });
    }
    
    // Solo HERE Autosuggest (el más rápido)
    const response = await axios.get(
      'https://autosuggest.search.hereapi.com/v1/autosuggest',
      {
        params: {
          q: query,
          at: at || '4.60971,-74.08175',
          limit: parseInt(limit) || 10,
          lang: lang || 'es-ES',
          in: 'countryCode:COL',
          apiKey: HERE_API_KEY,
        },
        timeout: 3000,
      }
    );
    
    const items = (response.data.items || [])
      .filter(item => item.position)
      .map(item => ({
        name: item.title || '',
        lat: item.position.lat,
        lon: item.position.lng,
        address: item.address?.label || item.title,
      }))
      .filter(item => {
        return item.lat >= 4.4 && item.lat <= 4.9 &&
               item.lon >= -74.3 && item.lon <= -73.9;
      })
      .slice(0, parseInt(limit) || 10);
    
    const result = { items };
    
    searchCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    const elapsed = Date.now() - startTime;
    console.log(`[SEARCH-FAST] ✅ ${items.length} resultados en ${elapsed}ms`);
    
    return res.json(result);
    
  } catch (error) {
    console.error('[SEARCH-FAST] ❌ Error:', error.message);
    return res.json({ items: [] });
  }
});

app.get('/places', async (req, res) => {
  const { id, full } = req.query;
  if (id && String(full) === '1') {
    try {
      const ocmId = String(id).startsWith('ocm:') ? String(id).slice(4) : String(id);
      const url = 'https://api.openchargemap.io/v3/poi/';
      const params = {
        output: 'json',
        camelcase: true,
        include: 'connections',
        chargepointid: ocmId
      };
      const { data } = await axios.get(url, { params });
      const poi = Array.isArray(data) ? data[0] : data;
      if (!poi) return res.json({});
      const mapped = mapOcmPoiToOurFormat(poi);
      return res.json(mapped);
    } catch (e) {
      console.error('OCM detail error', e?.message);
      return res.status(500).json({ error: 'ocm-detail-failed' });
    }
  }

  try {
    if (!ok(MAPTILER_KEY) && !ok(HERE_API_KEY)) {
      return res.status(500).json({ error: 'lugares_fallados', detail: 'Faltan MAPTILER_KEY y/o HERE_API_KEY' });
    }

    const rawQ = String(req.query.q || '').trim();
    
    // Si no hay query, devolver lugares populares de Bogotá
    if (!rawQ) {
      return res.json({
        items: [
          { name: 'Centro Comercial Unicentro', lat: 4.7009, lon: -74.0431, address: 'Carrera 15 #124-30, Bogotá' },
          { name: 'Aeropuerto El Dorado', lat: 4.7016, lon: -74.1469, address: 'Av. El Dorado #103-8, Bogotá' },
          { name: 'Centro Andino', lat: 4.6668, lon: -74.0530, address: 'Carrera 11 #82-71, Bogotá' },
          { name: 'Parque de la 93', lat: 4.6762, lon: -74.0485, address: 'Calle 93A, Bogotá' },
          { name: 'Usaquén', lat: 4.6948, lon: -74.0311, address: 'Localidad de Usaquén' },
          { name: 'Salitre Plaza', lat: 4.6541, lon: -74.1036, address: 'Carrera 68C #24B-60, Bogotá' },
          { name: 'Centro Comercial Titán Plaza', lat: 4.6956, lon: -74.0871, address: 'Calle 80 #69A-50, Bogotá' },
        ],
        provider: 'suggestions'
      });
    }

    const atStr = String(req.query.at || '').trim(); // "lat,lon"
    const lang  = String(req.query.lang || 'es').slice(0,2);
    let limit   = Number(req.query.limit || 8);
    if (!Number.isFinite(limit) || limit<=0) limit = 8; if (limit>12) limit=12;
    
    // VERIFICAR CACHÉ ANTES DE BUSCAR
    const cacheKey = `${rawQ.toLowerCase()}_${atStr}_${lang}_${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < SEARCH_CACHE_TTL) {
      console.log(`[SEARCH] ⚡ Cache HIT: "${rawQ}" (${cached.data.items?.length || 0} resultados)`);
      return res.json(cached.data);
    }
    
    console.log(`[SEARCH] 🔍 Buscando: "${rawQ}"`);
    const searchStart = Date.now();

    let atLat=null, atLon=null;
    if (atStr) {
      const [la, lo] = atStr.split(',').map(Number);
      if (Number.isFinite(la) && Number.isFinite(lo)) { atLat=la; atLon=lo; }
    }

    const norm = s => s
      .replace(/[.,]/g,' ')
      .replace(/\s+N[º°o\.]?\s*/ig,' # ')
      .replace(/\s*#\s*/g,' # ')
      .replace(/\s+/g,' ')
      .trim();

    const q = norm(rawQ);
    const looksConjunto = /^conj(?:unto)?\.?\s+/i.test(q);

    function expandQueries(q) {
      const qs = new Set(); const base = q;
      qs.add(base); qs.add(base.replace(/\s*#\s*/g,' # ')); qs.add(base.replace(/#/g,''));
      const m = base.match(/\b(calle|cra|carrera|cll|kr|av|avenida|diag|diagonal|transv|transversal)\s*([0-9a-z]+)\s*(?:#|\b)\s*([0-9a-z]+[-\s]?[0-9a-z]*)/i);
      if (m) { const via=m[1], a=m[2], b=m[3].replace(/\s+/g,'').toUpperCase(); qs.add(`${via} ${a.toUpperCase()} # ${b}`); }
      if (looksConjunto) {
        const tail = base.replace(/^conj(?:unto)?\.?\s+/i,'').trim();
        qs.add(`${tail} conjunto residencial`); qs.add(`conjunto residencial ${tail}`);
        qs.add(`${tail} unidad residencial`);  qs.add(`${tail} conjunto`); qs.add(tail);
      }
      return [...qs].filter(Boolean);
    }
    const queries = expandQueries(q);

    const results = [];

    /* ---------- MapTiler ---------- */
    if (ok(MAPTILER_KEY)) {
      const mtVariants = queries.slice(0, 4);
      for (const mtQ of mtVariants) {
        try {
          const params = {
            key: MAPTILER_KEY,
            limit,
            language: lang,
            country: 'CO',
            types: 'address,poi,place',
            fuzzyMatch: true,
            autocomplete: true,
          };
          if (atLat!=null && atLon!=null) {
            params.proximity = `${atLon},${atLat}`;
            params.bbox = bboxAround(atLat, atLon, 22);
          }
          const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(mtQ)}.json`;
          const r = await axios.get(url, { params, timeout: 10000 });
          const feats = Array.isArray(r.data?.features) ? r.data.features : [];
          feats.forEach(f => {
            const type = (Array.isArray(f.place_type) && f.place_type[0]) || f.properties?.type || f.layer || '';
            const lat = f.center ? f.center[1] : f.geometry?.coordinates?.[1];
            const lon = f.center ? f.center[0] : f.geometry?.coordinates?.[0];
            const full = f.place_name || f.properties?.label || '';
            const street = f.properties?.street || '';
            const house  = f.address || f.properties?.housenumber || (f.text && /^\d/.test(f.text) ? f.text : '');
            const name = (type.includes('address'))
              ? composeAddressName({ street, house, fullLabel: full })
              : (f.properties?.name || f.text || full || street);
            const road = street || extractRoadFromLabel(full);
            if (Number.isFinite(lat) && Number.isFinite(lon) && (name||full)) {
              results.push({
                type: type.includes('address') ? 'address' : (type || 'place'),
                name, address: full || name, lat:Number(lat), lon:Number(lon),
                provider:'maptiler', road, locality:''
              });
            }
          });
          if (results.length >= limit*1.2) break;
        } catch {}
      }
    }

    /* ---------- HERE (Autosuggest + Discover + Geocode) ---------- */
    if (ok(HERE_API_KEY)) {
      const hereVariants = queries.slice(0, 4);

      // Autosuggest
      for (const hq of hereVariants) {
        try {
          const params = { apiKey: HERE_API_KEY, q: hq, limit: Math.max(limit, 10), lang, in: 'countryCode:COL' };
          if (atLat!=null && atLon!=null) params.at = `${atLat},${atLon}`;
          const url = 'https://autosuggest.search.hereapi.com/v1/autosuggest';
          const r = await axios.get(url, { params, timeout: 9000 });
          const items = Array.isArray(r.data?.items) ? r.data.items : [];
          items.forEach(it => {
            if (!it.position) return;
            const lat = it.position.lat, lon = it.position.lng;
            const rt  = it.resultType || '';
            const isAddress = rt === 'houseNumber' || rt === 'street';
            const isLocality = rt === 'locality' || rt === 'administrativeArea';
            const mappedType = isLocality ? 'city' : (isAddress ? 'address' : 'poi');
            const name = isAddress
              ? (it.address && (it.address.label || composeAddressName({
                  street: it.address.street, house: it.address.houseNumber, fullLabel: it.address.label
                })))
              : (it.title || it.address?.label);
            const addr = it.address?.label || it.title || name;
            const road = it.address?.street || extractRoadFromLabel(addr);
            const locality = it.address ? (it.address.district || it.address.subdistrict || it.address.city || it.address.county || '') : '';
            if (Number.isFinite(lat) && Number.isFinite(lon) && name) {
              results.push({ type: mappedType, name, address: addr, lat, lon, provider:'here', road, locality });
            }
          });
          if (results.length >= limit*1.2) break;
        } catch {}
      }

      // Discover (POIs)
      for (const hq of hereVariants) {
        try {
          const params = { apiKey: HERE_API_KEY, q: hq, limit: Math.max(limit, 12), lang, in: 'countryCode:COL' };
          if (atLat!=null && atLon!=null) params.at = `${atLat},${atLon}`;
          const url = 'https://discover.search.hereapi.com/v1/discover';
          const r = await axios.get(url, { params, timeout: 9000 });
          const items = Array.isArray(r.data?.items) ? r.data.items : [];
          items.forEach(it => {
            const pos = it.position || {};
            const lat = Number(pos.lat), lon = Number(pos.lng);
            const name = it.title || it.address?.label || '';
            const addr = it.address?.label || name;
            const road = it.address?.street || extractRoadFromLabel(addr);
            const locality = it.address?.district || it.address?.city || it.address?.county || '';
            if (Number.isFinite(lat) && Number.isFinite(lon) && name) {
              results.push({ type: 'poi', name, address: addr, lat, lon, provider:'here-discover', road, locality });
            }
          });
          if (results.length >= limit*1.5) break;
        } catch {}
      }

      // Geocode (texto libre)
      for (const hq of hereVariants) {
        try {
          const params = { apiKey: HERE_API_KEY, q: hq, limit: Math.max(limit, 12), lang, in: 'countryCode:COL' };
          if (atLat!=null && atLon!=null) params.at = `${atLat},${atLon}`;
          const url = 'https://geocode.search.hereapi.com/v1/geocode';
          const r = await axios.get(url, { params, timeout: 9000 });
          const items = Array.isArray(r.data?.items) ? r.data.items : [];
          items.forEach(it => {
            const pos = it.position || {};
            const lat = Number(pos.lat), lon = Number(pos.lng);
            const name = it.title || it.address?.label || '';
            const addr = it.address?.label || name;
            const road = it.address?.street || extractRoadFromLabel(addr);
            const locality = it.address?.district || it.address?.city || it.address?.county || '';
            if (Number.isFinite(lat) && Number.isFinite(lon) && name) {
              results.push({ type: 'place', name, address: addr, lat, lon, provider:'here-geocode', road, locality });
            }
          });
          if (results.length >= limit*1.8) break;
        } catch {}
      }
    }

    /* ---------- Nominatim ---------- */
    try {
      const looksConjunto = /^conj(?:unto)?\.?\s+/i.test(String(req.query.q||''));
      const qN = looksConjunto ? queries.slice(0,4) : queries.slice(0,2);
      for (const qv of qN) {
        const params = {
          q: qv, format: 'jsonv2', addressdetails: 1,
          limit: Math.min(limit, 10), 'accept-language': lang, countrycodes: 'co'
        };
        if (atLat!=null && atLon!=null) { params.viewbox = bboxAround(atLat,atLon,18); params.bounded = 1; }
        const r = await axios.get('https://nominatim.openstreetmap.org/search', {
          params, headers: { 'User-Agent': 'ev-backend/1.0 (places)' }, timeout: 9000
        });
        (Array.isArray(r.data)? r.data: []).forEach(e => {
          const lat = Number(e.lat), lon = Number(e.lon);
          const label = e.display_name || qv;
          const road  = e.address?.road || e.address?.pedestrian || e.address?.footway || extractRoadFromLabel(label);
          const house = e.address?.house_number || '';
          const composed = composeAddressName({ street: road, house, fullLabel: label });
          const name = (e.type==='house' || e.addresstype==='house' || e.type==='building')
            ? (composed || label.split(',')[0])
            : (e.namedetails?.name || e.namedetails?.['name:es'] || label.split(',')[0]);
          const locality = pickLocalityFrom(e.address || {});
          if (Number.isFinite(lat) && Number.isFinite(lon) && (name||label)) {
            results.push({
              type: (e.type==='house' || e.addresstype==='house') ? 'address' : 'place',
              name: name || label, address: label, lat, lon,
              provider: 'nominatim', road, locality
            });
          }
        });
        if (results.length >= limit*1.5) break;
      }
    } catch {}

    // ==== dedupe + ranking ====
    function dedupePlaces(list) {
      const byKey = new Map();
      for (const it of list) {
        const key = `${(it.name||'').toLowerCase()}|${Math.round(it.lat*1e5)}|${Math.round(it.lon*1e5)}`;
        if (!byKey.has(key)) byKey.set(key, it);
      }
      return [...byKey.values()];
    }
    const escapeRegex = s => String(s||'').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let items = dedupePlaces(results);
    const cleanAll = s => String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
    const tokensAll = cleanAll(q).split(/\s+/).filter(Boolean);
    const exactToken = tokensAll.length === 1 ? tokensAll[0] : null;

    let farExactExists = false;
    if (atLat!=null && atLon!=null && exactToken) {
      const rx = new RegExp(`\\b${escapeRegex(exactToken)}\\b`, 'i');
      farExactExists = items.some(it => {
        const hay = cleanAll((it.name||'') + ' ' + (it.address||''));
        const km = havKm(atLat, atLon, it.lat, it.lon);
        return rx.test(hay) && km > 120;
      });
    }

    items = items.map(it => {
      let score = 0;
      if (it.type === 'address') score += 50;
      else if (it.type === 'city') score += 48;
      else score += 20;

      let km = null;
      if (atLat!=null && atLon!=null) {
        km = havKm(atLat, atLon, it.lat, it.lon);
        score += Math.max(0, 30 - Math.min(30, km));
      }

      if (/here/.test(it.provider) && it.type!=='address') score += 5;
      if (/conjunto|residencial|torre|edificio|bloque/i.test(it.name)) score += 6;

      const hay = cleanAll((it.name||'') + ' ' + (it.address||''));
      const allTokensInside = tokensAll.every(t => hay.includes(t));
      const someTokensInside = tokensAll.some(t => hay.includes(t));
      if (allTokensInside) score += 25; else if (someTokensInside) score += 10;

      if (exactToken) {
        const rx = new RegExp(`\\b${escapeRegex(exactToken)}\\b`);
        if (rx.test(cleanAll(it.name||'')) || rx.test(cleanAll(it.address||''))) {
          score += (it.type === 'city') ? 60 : 45;
        }
      }

      if (farExactExists && km !== null && km < 60) score -= 40;

      return { ...it, _score: score };
    }).sort((a,b) => b._score - a._score);

    items = items.slice(0, limit);

    // Reverse HERE (top-8) para completar road/locality
    async function fillRoadViaReverse(list) {
      if (!HERE_API_KEY) return list;
      const top = list.slice(0, 8);
      await Promise.all(top.map(async it => {
        if (it.road && it.locality) return;
        try {
          const r = await axios.get('https://revgeocode.search.hereapi.com/v1/revgeocode', {
            params: { at: `${it.lat},${it.lon}`, apiKey: HERE_API_KEY, lang: 'es', limit: 1 },
            timeout: 1500
          });
          const addr = r.data?.items?.[0]?.address;
          if (addr) {
            it.road = it.road || addr.street || extractRoadFromLabel(addr.label || '');
            it.locality = it.locality || addr.district || addr.city || addr.county || '';
          }
        } catch {}
      }));
      return list;
    }
    items = await fillRoadViaReverse(items);

    items = items.map(({ _score, ...rest }) => rest);

    // Guardar resultados en caché
    const result = { items, provider: 'mt+here+nomi+overpass' };
    searchCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    const elapsed = Date.now() - searchStart;
    console.log(`[SEARCH] ✅ ${items.length} resultados en ${elapsed}ms para "${rawQ}"`);

    return res.json(result);
  } catch (err) {
    const status = Number(err?.response?.status) || 500;
    const body   = err?.response?.data || String(err?.message || err);
    res.status(status).json({ error: 'lugares_fallados', detail: body });
  }
});

/* ==================== TRAFFIC (HERE Incidents 6.3) ==================== */
const trafficCache = new Map(); // key -> { ts, payload }
const inflight     = new Map(); // key -> Promise

// ==================== TRÁFICO EN TIEMPO REAL ====================

/**
 * Obtener datos de flujo de tráfico (Traffic Flow) usando HERE Traffic API v7
 * Devuelve líneas de tráfico coloreadas según velocidad (estilo Waze)
 * Query params:
 *   - lat: Latitud central
 *   - lng: Longitud central
 *   - radius: Radio en km (default: 10)
 */
app.get('/traffic-flow', async (req, res) => {
  // TEMPORALMENTE DESHABILITADO - Traffic API da 401
  // Retornar datos vacíos para que la app no crashee
  console.log('[TRAFFIC-FLOW] ⚠️  Temporalmente deshabilitado - retornando datos vacíos');
  return res.json({ segments: [] });
  
  /* CÓDIGO ORIGINAL COMENTADO TEMPORALMENTE
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseFloat(req.query.radius || 10); // km - reducido para mejor rendimiento
    
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      console.log('[TRAFFIC-FLOW] ❌ Parámetros inválidos:', { lat, lng });
      return res.status(400).json({
        error: 'invalid_params',
        detail: 'Se requieren lat y lng válidos'
      });
    }
    
    if (!HERE_API_KEY) {
      console.log('[TRAFFIC-FLOW] ❌ HERE_API_KEY no configurada');
      return res.status(500).json({ error: 'api_key_missing', detail: 'HERE_API_KEY no configurada' });
    }
    
    console.log(`[TRAFFIC-FLOW] 🚦 Consultando flujo en (${lat}, ${lng}) radio ${radius}km`);
    
    // Calcular bbox
    const latDelta = radius / 111;
    const lngDelta = radius / (111 * Math.cos(lat * Math.PI / 180));
    
    const south = lat - latDelta;
    const north = lat + latDelta;
    const west = lng - lngDelta;
    const east = lng + lngDelta;
    
    console.log(`[TRAFFIC-FLOW] 📍 BBOX: [${west.toFixed(3)}, ${south.toFixed(3)}, ${east.toFixed(3)}, ${north.toFixed(3)}]`);
    
    // HERE Traffic Flow API v7
    const url = 'https://data.traffic.hereapi.com/v7/flow';
    const params = {
      in: `bbox:${west},${south},${east},${north}`,
      locationReferencing: 'shape',
      apiKey: HERE_API_KEY
    };
    
    console.log(`[TRAFFIC-FLOW] 🌐 Llamando HERE Flow API...`);
    
    let response;
    try {
      response = await axios.get(url, { 
        params,
        timeout: 15000 
      });
    } catch (axiosError) {
      console.log(`[TRAFFIC-FLOW] ❌ Error de Axios:`, axiosError.message);
      if (axiosError.response) {
        console.log(`[TRAFFIC-FLOW] ❌ HERE respondió: ${axiosError.response.status}`);
        return res.status(axiosError.response.status).json({ 
          error: 'traffic_api_failed', 
          detail: `HERE API: ${axiosError.response.status}`
        });
      }
      return res.status(503).json({ 
        error: 'traffic_api_unavailable', 
        detail: 'No se pudo conectar con HERE Traffic API'
      });
    }
    
    const data = response.data;
    const results = data.results || [];
    
    console.log(`[TRAFFIC-FLOW] ✅ Segmentos recibidos: ${results.length}`);
    
    // Transformar a formato simplificado para el mapa
    const segments = results.map(item => {
      const location = item.location || {};
      const shape = location.shape || {};
      const links = shape.links || [];
      
      if (links.length === 0) return null;
      
      const link = links[0];
      const points = link.points || [];
      
      if (points.length < 2) return null;
      
      // Convertir puntos a formato [lng, lat]
      const coordinates = points.map(p => [p.lng, p.lat]);
      
      // Obtener datos de velocidad
      const currentFlow = item.currentFlow || {};
      const speed = currentFlow.speed || 0;
      const freeFlow = currentFlow.freeFlow || speed;
      const jamFactor = currentFlow.jamFactor || 0; // 0-10 (0=libre, 10=atasco total)
      const confidence = currentFlow.confidence || 0.5;
      
      // Clasificar tráfico según jamFactor
      // Solo mostrar amarillo (medio) y rojo (denso)
      // Omitir verde (fluido) para no saturar el mapa
      let trafficLevel = null;
      let color = null;
      
      if (jamFactor >= 7) {
        trafficLevel = 'heavy';
        color = '#FF0000'; // Rojo
      } else if (jamFactor >= 4) {
        trafficLevel = 'moderate';
        color = '#FFA500'; // Naranja/Amarillo
      } else {
        // Tráfico fluido - no mostrar
        return null;
      }
      
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        },
        properties: {
          speed: Math.round(speed),
          freeFlow: Math.round(freeFlow),
          jamFactor: jamFactor,
          trafficLevel: trafficLevel,
          color: color,
          confidence: confidence
        }
      };
    }).filter(s => s !== null);
    
    console.log(`[TRAFFIC-FLOW] 📋 Segmentos procesados: ${segments.length}`);
    
    // Estadísticas (solo medio y denso)
    const stats = {
      total: segments.length,
      moderate: segments.filter(s => s.properties.trafficLevel === 'moderate').length,
      heavy: segments.filter(s => s.properties.trafficLevel === 'heavy').length
    };
    
    console.log(`[TRAFFIC-FLOW] 📊 Stats: Medio=${stats.moderate}, Denso=${stats.heavy}`);
    
    res.json({
      type: 'FeatureCollection',
      features: segments,
      stats: stats,
      source: 'HERE Traffic Flow API v7',
      area: { lat, lng, radius }
    });
    
  } catch (error) {
    console.error('[TRAFFIC-FLOW] ❌ Error inesperado:', error);
    console.error('[TRAFFIC-FLOW] ❌ Stack:', error.stack);
    res.status(500).json({ 
      error: 'traffic_failed', 
      detail: error.message 
    });
  }
  */ // FIN CÓDIGO COMENTADO TEMPORALMENTE
});

/**
 * Obtener incidentes de tráfico usando HERE Traffic API v7
 * Query params:
 *   - lat: Latitud central
 *   - lng: Longitud central
 *   - radius: Radio en km (default: 50)
 */
app.get('/traffic-reports', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseFloat(req.query.radius || 50); // km
    
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      console.log('[TRAFFIC] ❌ Parámetros inválidos:', { lat, lng });
      return res.status(400).json({
        error: 'invalid_params',
        detail: 'Se requieren lat y lng válidos'
      });
    }
    
    if (!HERE_API_KEY) {
      console.log('[TRAFFIC] ❌ HERE_API_KEY no configurada');
      return res.status(500).json({ error: 'api_key_missing', detail: 'HERE_API_KEY no configurada' });
    }
    
    console.log(`[TRAFFIC] 🚦 Consultando incidentes en (${lat}, ${lng}) radio ${radius}km`);
    
    // Calcular bbox aproximado desde el punto central
    // 1 grado de latitud ≈ 111 km
    // 1 grado de longitud ≈ 111 km * cos(lat)
    const latDelta = radius / 111;
    const lngDelta = radius / (111 * Math.cos(lat * Math.PI / 180));
    
    const south = lat - latDelta;
    const north = lat + latDelta;
    const west = lng - lngDelta;
    const east = lng + lngDelta;
    
    console.log(`[TRAFFIC] 📍 BBOX calculado: [${west.toFixed(3)}, ${south.toFixed(3)}, ${east.toFixed(3)}, ${north.toFixed(3)}]`);
    
    // HERE Traffic Incidents API v7
    const url = 'https://data.traffic.hereapi.com/v7/incidents';
    const params = {
      in: `bbox:${west},${south},${east},${north}`,
      locationReferencing: 'shape',
      lang: 'es-CO', // Español Colombia (BCP47)
      apiKey: HERE_API_KEY
    };
    
    console.log(`[TRAFFIC] 🌐 URL: ${url}`);
    console.log(`[TRAFFIC] 📋 Params:`, JSON.stringify(params, null, 2));
    
    let response;
    try {
      response = await axios.get(url, { 
        params,
        timeout: 10000 
      });
    } catch (axiosError) {
      console.log(`[TRAFFIC] ❌ Error de Axios:`, axiosError.message);
      if (axiosError.response) {
        console.log(`[TRAFFIC] ❌ HERE respondió: ${axiosError.response.status}`);
        console.log(`[TRAFFIC] ❌ Datos:`, JSON.stringify(axiosError.response.data, null, 2));
        
        // Si HERE devuelve 401, probablemente la key es inválida o no tiene permisos
        if (axiosError.response.status === 401) {
          return res.status(500).json({ 
            error: 'traffic_api_unauthorized', 
            detail: 'La API key de HERE no tiene permisos para Traffic API'
          });
        }
        
        return res.status(axiosError.response.status).json({ 
          error: 'traffic_api_failed', 
          detail: `HERE API: ${axiosError.response.status}`,
          message: axiosError.response.data?.message || 'Error desconocido'
        });
      }
      
      // Error de red o timeout
      console.log(`[TRAFFIC] ❌ Error de red/timeout:`, axiosError.code);
      return res.status(503).json({ 
        error: 'traffic_api_unavailable', 
        detail: 'No se pudo conectar con HERE Traffic API',
        code: axiosError.code
      });
    }
    
    const data = response.data;
    const incidents = data.results || [];
    
    console.log(`[TRAFFIC] ✅ Respuesta exitosa de HERE`);
    console.log(`[TRAFFIC] 📊 Incidentes recibidos: ${incidents.length}`);
    
    // Transformar incidentes de HERE al formato de la app
    const reports = incidents.map(incident => {
      const location = incident.location?.shape?.links?.[0];
      const coords = location?.points?.[0];
      
      if (!coords) {
        console.log('[TRAFFIC] ⚠️  Incidente sin coordenadas, saltando...');
        return null;
      }
      
      // Mapear tipos de HERE a tipos de la app
      let type = 'other';
      const incidentType = (incident.incidentDetails?.type || '').toLowerCase();
      
      if (incidentType.includes('accident')) type = 'accident';
      else if (incidentType.includes('construction')) type = 'roadwork';
      else if (incidentType.includes('congestion') || incidentType.includes('traffic')) type = 'trafficHeavy';
      else if (incidentType.includes('road_closure') || incidentType.includes('closure')) type = 'hazard';
      else if (incidentType.includes('weather')) type = 'hazard';
      
      console.log(`[TRAFFIC] 📍 Incidente: ${incident.incidentDetails?.type} -> ${type} en (${coords.lat}, ${coords.lng})`);
      
      // Calcular tiempo de expiración (default 2 horas si no viene)
      const now = new Date();
      const endTime = incident.incidentDetails?.endTime 
        ? new Date(incident.incidentDetails.endTime)
        : new Date(now.getTime() + 2 * 60 * 60 * 1000);
      
      return {
        id: incident.incidentDetails?.id || `here_${Math.random().toString(36).substr(2, 9)}`,
        type: type,
        lat: coords.lat,
        lng: coords.lng,
        description: incident.incidentDetails?.description?.value || 'Incidente reportado',
        timestamp: incident.incidentDetails?.startTime || now.toISOString(),
        expiresAt: endTime.toISOString(),
        source: 'HERE',
        severity: incident.incidentDetails?.criticality || 'MINOR'
      };
    }).filter(r => r !== null);
    
    console.log(`[TRAFFIC] 📋 Reportes transformados: ${reports.length}`);
    
    res.json({
      reports: reports,
      count: reports.length,
      source: 'HERE Traffic API v7',
      area: { lat, lng, radius }
    });
    
  } catch (error) {
    console.error('[TRAFFIC] ❌ Error inesperado:', error);
    console.error('[TRAFFIC] ❌ Stack:', error.stack);
    res.status(500).json({ 
      error: 'traffic_failed', 
      detail: error.message 
    });
  }
});

// Endpoint legacy (mantener por compatibilidad)
app.get('/traffic', async (req, res) => {
  try {
    let { bbox, west, south, east, north, mode } = req.query;

    // permitir ambas formas: bbox=w,s,e,n o west/south/east/north
    if (!bbox && (west && south && east && north)) {
      bbox = [west, south, east, north].join(',');
    }

    if (!bbox) {
      return res.status(400).json({
        error: 'bbox_required',
        detail: 'Usar bbox=w,s,e,n'
      });
    }

    mode = (mode === 'lonlat') ? 'lonlat' : 'latlon';

    // Redirigir al nuevo endpoint
    const [w, s, e, n] = bbox.split(',').map(parseFloat);
    const centerLat = (s + n) / 2;
    const centerLng = (w + e) / 2;
    const radius = Math.max(
      haversineDistance(centerLat, centerLng, s, centerLng),
      haversineDistance(centerLat, centerLng, centerLat, e)
    );
    
    return res.redirect(`/traffic-reports?lat=${centerLat}&lng=${centerLng}&radius=${radius}`);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'traffic_failed' });
  }
});

/* ====================== ROUTE (HERE v8) ====================== */

// ===== FUNCIONES DE ELEVACIÓN =====

// Samplear puntos de una ruta cada X metros
function sampleRoutePoints(coordinates, intervalMeters = 5000) {
  if (!coordinates || coordinates.length < 2) return [];
  
  // Sampling simple: tomar cada N puntos para obtener ~20-30 muestras
  const targetSamples = 25;
  const step = Math.max(1, Math.floor(coordinates.length / targetSamples));
  
  const sampled = [];
  
  // Incluir el primero
  sampled.push(coordinates[0]);
  
  // Tomar puntos intermedios
  for (let i = step; i < coordinates.length - 1; i += step) {
    sampled.push(coordinates[i]);
  }
  
  // Siempre incluir el último
  if (coordinates.length > 1) {
    sampled.push(coordinates[coordinates.length - 1]);
  }
  
  console.log(`[ELEVATION] 🎯 Sampleo: ${sampled.length} puntos de ${coordinates.length} (cada ${step} puntos)`);
  
  return sampled;
}

// Obtener elevaciones usando Mapbox Tilequery API
async function getElevationProfile(coordinates) {
  if (!coordinates || coordinates.length < 2) {
    console.log('[ELEVATION] ⚠️  Coordenadas insuficientes');
    return null;
  }
  
  const sampledPoints = sampleRoutePoints(coordinates, 5000);
  console.log(`[ELEVATION] 📊 Puntos sampleados: ${sampledPoints.length} de ${coordinates.length}`);
  console.log(`[ELEVATION] 🔍 Formato del primer punto:`, sampledPoints[0]);
  console.log(`[ELEVATION] 🔍 Tipo:`, typeof sampledPoints[0], Array.isArray(sampledPoints[0]) ? 'array' : 'object');
  
  if (sampledPoints.length < 2) {
    console.log('[ELEVATION] ⚠️  Muy pocos puntos para calcular elevación');
    return null;
  }
  
  const elevations = [];
  
  // Usar Open Elevation API (gratis, sin límites, sin API key)
  const batchSize = 100; // Máximo por request
  
  for (let i = 0; i < sampledPoints.length; i += batchSize) {
    const batch = sampledPoints.slice(i, i + batchSize);
    
    try {
      // Formato para Open Elevation: [{latitude, longitude}, ...]
      // Las coordenadas vienen como objetos {lat, lng} no como arrays [lng, lat]
      const locations = batch.map(point => {
        // Extraer lat y lng del punto (puede ser objeto o array)
        const lat = point.lat || point[1];
        const lng = point.lng || point.lon || point[0];
        
        return {
          latitude: lat,
          longitude: lng
        };
      });
      
      console.log(`[ELEVATION] 🌐 Llamando API con ${locations.length} puntos...`);
      console.log(`[ELEVATION] 📋 Primer punto:`, JSON.stringify(locations[0]));
      console.log(`[ELEVATION] 📋 Último punto:`, JSON.stringify(locations[locations.length - 1]));
      
      const response = await axios.post(
        'https://api.open-elevation.com/api/v1/lookup',
        { locations },
        { 
          timeout: 10000,
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      const results = response.data.results || [];
      console.log(`[ELEVATION] 📥 Recibidos ${results.length} resultados`);
      
      results.forEach(result => {
        elevations.push(result.elevation || 0);
      });
      
    } catch (error) {
      console.error('[ELEVATION] ❌ Error obteniendo batch:', error.message);
      if (error.response) {
        console.error('[ELEVATION] 📋 Status:', error.response.status);
        console.error('[ELEVATION] 📋 Data:', JSON.stringify(error.response.data));
      }
      // Rellenar con 0s si falla
      elevations.push(...new Array(batch.length).fill(0));
    }
    
    // Pequeña pausa entre batches para no saturar la API
    if (i + batchSize < sampledPoints.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(`[ELEVATION] 📊 Total elevaciones obtenidas: ${elevations.length}`);
  return elevations;
}

// Calcular impacto de elevación en el consumo
function calculateElevationImpact(elevations) {
  if (!elevations || elevations.length < 2) {
    return { totalClimb: 0, totalDescent: 0, batteryImpact: 0 };
  }
  
  let totalClimb = 0;
  let totalDescent = 0;
  
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    
    if (diff > 0) {
      totalClimb += diff;
    } else if (diff < 0) {
      totalDescent += Math.abs(diff);
    }
  }
  
  // Fórmula de impacto en batería:
  // Basado en datos reales de EVs en Colombia (Melgar-Bogotá, etc)
  // - Subida: 1.8% de batería por cada 100 metros (0.018% por metro)
  // - Bajada: 1.2% recuperado por cada 100 metros con regenerativo (0.012% por metro)
  const climbPenalty = totalClimb * 0.018;  // 1.8% por cada 100m de subida
  const descentBonus = totalDescent * 0.012; // 1.2% recuperado por cada 100m de bajada
  
  const batteryImpact = climbPenalty - descentBonus;
  
  return {
    totalClimb: Math.round(totalClimb),
    totalDescent: Math.round(totalDescent),
    batteryImpact: Math.round(batteryImpact * 1000) / 1000 // 3 decimales
  };
}

// ==================== ENDPOINT /route CON GOOGLE MAPS + HERE FALLBACK ====================
app.get('/route', async (req, res) => {
  try {
    const origin = String(req.query.from || req.query.origin || '');
    const destination = String(req.query.to || req.query.destination || '');
    const waypoints = req.query.waypoints ? String(req.query.waypoints) : null;
    const vehicleId = String(req.query.vehicle_id || 'generic');
    const lang = String(req.query.lang || 'es-ES');
    const debug = req.query.debug != null;
    const provider = String(req.query.provider || 'auto'); // 'google', 'here', 'auto'

    console.log('[ROUTE] 🚗 Calculando ruta:');
    console.log('[ROUTE]   Origen:', origin);
    console.log('[ROUTE]   Destino:', destination);
    console.log('[ROUTE]   Waypoints:', waypoints || 'ninguno');
    console.log('[ROUTE]   Provider:', provider);

    if (!origin || !destination) {
      return res.status(400).json({ 
        error: 'BadRequest', 
        detail: 'origin/from y destination/to son requeridos (lat,lon)' 
      });
    }

    // Verificar caché
    const cached = getCachedRoute(origin, destination, waypoints);
    if (cached) {
      console.log('[ROUTE] ⚡ Usando ruta cacheada');
      return res.json(cached);
    }

    let routeData = null;
    let usedProvider = null;

    // Estrategia: Google primero, HERE como fallback
    if (provider === 'auto' || provider === 'google') {
      if (GOOGLE_MAPS_API_KEY) {
        try {
          routeData = await calculateRouteGoogle(origin, destination, waypoints, vehicleId);
          usedProvider = 'google';
          console.log('[ROUTE] ✅ Usando Google Maps');
        } catch (error) {
          console.error('[ROUTE] ⚠️ Google Maps falló:', error.message);
          if (provider === 'google') {
            return res.status(500).json({ 
              error: 'google_failed', 
              detail: error.message 
            });
          }
          // Continuar a HERE si provider='auto'
        }
      } else {
        console.log('[ROUTE] ⚠️ GOOGLE_MAPS_API_KEY no configurada');
      }
    }

    // Fallback a HERE si Google falló o no está disponible
    if (!routeData && (provider === 'auto' || provider === 'here')) {
      if (!HERE_API_KEY) {
        return res.status(500).json({ 
          error: 'no_provider', 
          detail: 'Ni Google Maps ni HERE API están configurados' 
        });
      }

      console.log('[ROUTE] 🔄 Usando HERE como fallback');
      
      try {
        const url = 'https://router.hereapi.com/v8/routes';
        const params = {
          transportMode: 'car',
          routingMode: 'fast',
          origin,
          destination,
          return: 'summary,polyline,actions,turnByTurnActions,instructions',
          spans: 'length',
          lang,
          apiKey: HERE_API_KEY
        };

        let viaString = '';
        if (waypoints) {
          const waypointsList = waypoints.split('|');
          viaString = waypointsList.map(wp => `&via=${wp}!passThrough=true`).join('');
          console.log('[ROUTE] 📍 Waypoints agregados:', waypointsList.length);
        }

        const queryString = new URLSearchParams(params).toString();
        const fullUrl = `${url}?${queryString}${viaString}`;

        const r = await axios.get(fullUrl, { timeout: 12000 });
        const route = r.data?.routes?.[0];
        const sections = route?.sections || [];

        if (sections.length === 0) {
          return res.status(502).json({ 
            error: 'NoRoute', 
            detail: 'HERE no devolvió secciones' 
          });
        }

        // Procesar polyline
        let allPoints = [];
        let totalDistanceMeters = 0;
        let totalDurationSeconds = 0;

        for (let i = 0; i < sections.length; i++) {
          const section = sections[i];
          const rawPolyline = typeof section.polyline === 'string' ? section.polyline : null;

          if (rawPolyline) {
            try {
              const sectionPoints = decodeFlexToPoints(rawPolyline);
              if (allPoints.length > 0 && sectionPoints.length > 0) {
                sectionPoints.shift();
              }
              allPoints = allPoints.concat(sectionPoints);
            } catch (e) {
              console.log('[ROUTE] ⚠️ Error decodificando polyline de sección', i);
            }
          }

          const summary = section.summary || {};
          totalDistanceMeters += Number(summary.length) || 0;
          totalDurationSeconds += Number(summary.duration) || 0;
        }

        // Densificar
        const points = densifyRoute(allPoints, 40);
        console.log('[ROUTE] 🔢 Puntos originales:', allPoints.length, '→ Densificados:', points.length);

        // Procesar steps
        const steps = [];
        let currentOffset = 0;

        for (let i = 0; i < sections.length; i++) {
          const section = sections[i];
          const sectionActions = section.actions || [];

          for (const action of sectionActions) {
            const instruction = action.instruction || '';
            const lengthMeters = Number(action.length) || 0;

            if (!instruction && action.action === 'continue') continue;

            let text = instruction || '';
            if (!text && action.action) {
              const actionMap = {
                'depart': 'Inicia el viaje',
                'arrive': 'Llegaste a tu destino',
                'turn': action.direction ? `Gira a la ${action.direction}` : 'Gira',
                'fork': `Toma la ${action.direction === 'left' ? 'izquierda' : 'derecha'}`,
                'merge': 'Incorpórate',
                'roundabout': 'Toma la rotonda',
                'continue': 'Continúa'
              };
              text = actionMap[action.action] || action.action;
            }

            if (text) {
              steps.push({
                text: text,
                offset: Math.round(currentOffset),
                length_m: Math.round(lengthMeters)
              });
            }

            currentOffset += lengthMeters;
          }
        }

        console.log('[ROUTE] 📋 Steps generados:', steps.length);

        routeData = {
          points,
          steps,
          distanceMeters: totalDistanceMeters,
          durationSeconds: totalDurationSeconds,
          provider: 'here'
        };
        usedProvider = 'here';

      } catch (error) {
        console.error('[ROUTE] ❌ HERE también falló:', error.message);
        return res.status(500).json({ 
          error: 'all_providers_failed', 
          detail: 'Google y HERE fallaron' 
        });
      }
    }

    if (!routeData) {
      return res.status(500).json({ 
        error: 'no_route', 
        detail: 'No se pudo calcular la ruta' 
      });
    }

    // Obtener perfil de elevación (Google Elevation API)
    let elevationData = null;
    
    if (routeData.points.length > 0 && GOOGLE_MAPS_API_KEY) {
      try {
        const cacheKey = `elev_${origin}_${destination}_${vehicleId}`;
        const cached = elevationCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < ELEVATION_CACHE_TTL) {
          console.log(`[ELEVATION] ⚡ Cache HIT: ${origin} → ${destination}`);
          elevationData = cached.data;
        } else {
          console.log(`[ELEVATION] 🏔️  Obteniendo perfil con Google: ${origin} → ${destination}`);
          const startTime = Date.now();

          const coordinates = routeData.points.map(p => ({ lat: p.lat, lon: p.lng || p.lon }));
          
          // Samplear puntos (máximo 512 para Google Elevation, usar ~200 para eficiencia)
          let sampledCoords = coordinates;
          if (coordinates.length > 200) {
            const step = Math.ceil(coordinates.length / 200);
            sampledCoords = coordinates.filter((_, i) => i % step === 0);
            // Siempre incluir el último punto
            if (sampledCoords[sampledCoords.length - 1] !== coordinates[coordinates.length - 1]) {
              sampledCoords.push(coordinates[coordinates.length - 1]);
            }
            console.log(`[ELEVATION] 🎯 Sampleo: ${sampledCoords.length} puntos de ${coordinates.length}`);
          }

          // Google Elevation acepta hasta 512 puntos por request
          // Dividir en chunks de 200 para estar seguro con el largo de URL
          const chunks = [];
          for (let i = 0; i < sampledCoords.length; i += 200) {
            chunks.push(sampledCoords.slice(i, i + 200));
          }

          const allElevations = [];
          for (const chunk of chunks) {
            const locations = chunk.map(c => `${c.lat},${c.lon}`).join('|');
            const elevUrl = `https://maps.googleapis.com/maps/api/elevation/json`;
            const elevResponse = await axios.get(elevUrl, { 
              params: {
                locations: locations,
                key: GOOGLE_MAPS_API_KEY
              },
              timeout: 15000 
            });
            
            if (elevResponse.data.status === 'OK' && Array.isArray(elevResponse.data.results)) {
              for (const result of elevResponse.data.results) {
                allElevations.push(result.elevation || 0);
              }
            } else {
              console.error('[ELEVATION] ❌ Google Elevation API error:', elevResponse.data.status);
              break;
            }
          }

          if (allElevations.length > 1) {
            const startElev = allElevations[0];
            const endElev = allElevations[allElevations.length - 1];

            const totalElevGain = allElevations.reduce((sum, e, i) => {
              if (i === 0) return 0;
              const diff = e - allElevations[i - 1];
              return diff > 0 ? sum + diff : sum;
            }, 0);

            const totalElevLoss = allElevations.reduce((sum, e, i) => {
              if (i === 0) return 0;
              const diff = e - allElevations[i - 1];
              return diff < 0 ? sum + Math.abs(diff) : sum;
            }, 0);

            elevationData = {
              elevations: allElevations,
              start_elevation: Math.round(startElev),
              end_elevation: Math.round(endElev),
              gain_m: Math.round(totalElevGain),
              loss_m: Math.round(totalElevLoss),
              net_change: Math.round(endElev - startElev)
            };

            elevationCache.set(cacheKey, {
              data: elevationData,
              timestamp: Date.now()
            });

            console.log(`[ELEVATION] ✅ Perfil obtenido en ${Date.now() - startTime}ms`);
            console.log(`[ELEVATION]   Inicio: ${startElev.toFixed(0)}m → Fin: ${endElev.toFixed(0)}m`);
            console.log(`[ELEVATION]   Ascenso: +${totalElevGain.toFixed(0)}m, Descenso: -${totalElevLoss.toFixed(0)}m`);
            console.log(`[ELEVATION]   Cambio neto: ${(endElev - startElev).toFixed(0)}m`);
          }
        }
      } catch (error) {
        console.error('[ELEVATION] ❌ Error:', error.message);
      }
    } else {
      console.log('[ELEVATION] ⚠️ Sin GOOGLE_MAPS_API_KEY - sin cálculo de elevación');
    }

    // Calcular consumo estimado con altimetría real
    const profile = VEHICLE_PROFILES[vehicleId] || VEHICLE_PROFILES['generic'];
    const batteryKwh = profile.batteryKwh || 60;
    const baseConsumptionRate = profile.consumptionRate || 0.28;
    
    const distanceKm = routeData.distanceMeters / 1000;
    const avgSpeedKmh = (distanceKm / (routeData.durationSeconds / 3600));
    
    let adjustedConsumption = baseConsumptionRate;
    if (avgSpeedKmh < 30) adjustedConsumption *= 1.1;
    else if (avgSpeedKmh > 80) adjustedConsumption *= 1.15;
    
    let totalConsumptionPercent;
    
    if (elevationData && (elevationData.gain_m > 0 || elevationData.loss_m > 0)) {
      // 🏔️ CÁLCULO CON FÍSICA REAL DE ALTIMETRÍA
      const gainM = elevationData.gain_m || 0;
      const lossM = elevationData.loss_m || 0;
      const netChange = elevationData.net_change || 0;
      const totalVertical = gainM + lossM;
      
      if (totalVertical > 50) {
        // ====== MODELO FÍSICO BASADO EN ENERGÍA ======
        const vehicleWeightKg = profile.weightKg || 1700; // Peso estimado si no está definido
        const gravity = 9.81;
        
        // 1. DETECTAR TIPO DE VIAJE
        const isDownhillTrip = lossM > (gainM * 1.5); // Bajada neta significativa
        
        // 2. ENERGÍA POR RODAMIENTO (Consumo base en plano)
        // consumptionRate está en %/km, convertir a Wh/km: (rate/100) * batteryKwh * 1000
        const consumptionWhPerKm = (baseConsumptionRate / 100) * batteryKwh * 1000;
        
        // Si es bajada neta, menos fricción (calibrado con datos reales Bog→Gir)
        const rollingFactor = isDownhillTrip ? 0.90 : 1.0;
        const energyFlatWh = distanceKm * consumptionWhPerKm * rollingFactor;
        
        // 3. ENERGÍA PARA SUBIR (eficiencia motor 82% - calibrado con Gir→Bog real: 57% en 116km)
        let energyToClimbWh = (vehicleWeightKg * gravity * gainM) / 3600 / 0.82;
        
        // 4. ENERGÍA RECUPERADA AL BAJAR (regeneración 92% - calibrado con Bog→Gir real: 5% en 119km)
        const regenEfficiency = 0.92;
        const energyRegenWh = (vehicleWeightKg * gravity * lossM) / 3600 * regenEfficiency;
        
        // 5. ENERGÍA TOTAL (sin efecto montaña rusa - calibración real lo cubre)
        let totalEnergyWh = energyFlatWh + energyToClimbWh - energyRegenWh;
        
        // 7. MÍNIMO FÍSICO: luces, AC, pantalla, etc. (~20 Wh/km)
        const minEnergyWh = distanceKm * 20;
        if (totalEnergyWh < minEnergyWh) totalEnergyWh = minEnergyWh;
        
        // 8. CONVERTIR A % DE BATERÍA
        totalConsumptionPercent = (totalEnergyWh / 1000) / batteryKwh * 100;
        
        console.log(`[CONSUMPTION] 🏔️ Cálculo FÍSICO con altimetría:`);
        console.log(`[CONSUMPTION]   Tipo: ${isDownhillTrip ? 'BAJADA NETA' : 'MIXTO/SUBIDA'}`);
        console.log(`[CONSUMPTION]   Ascenso: +${gainM}m | Descenso: -${lossM}m | Neto: ${netChange}m`);
        console.log(`[CONSUMPTION]   Energía plano: ${(energyFlatWh/1000).toFixed(1)} kWh`);
        console.log(`[CONSUMPTION]   Energía subida: +${(energyToClimbWh/1000).toFixed(1)} kWh ${isDownhillTrip ? '(reducida 30% montaña rusa)' : ''}`);
        console.log(`[CONSUMPTION]   Regeneración: -${(energyRegenWh/1000).toFixed(1)} kWh (92% eficiencia)`);
        console.log(`[CONSUMPTION]   Energía total: ${(totalEnergyWh/1000).toFixed(1)} kWh`);
        console.log(`[CONSUMPTION]   Consumo: ${totalConsumptionPercent.toFixed(1)}% (batería ${batteryKwh} kWh)`);
        console.log(`[CONSUMPTION]   vs plano: ${(distanceKm * adjustedConsumption).toFixed(1)}%`);
      } else {
        totalConsumptionPercent = distanceKm * adjustedConsumption;
        console.log(`[CONSUMPTION] ➡️ Ruta plana (${totalVertical}m cambio), consumo: ${totalConsumptionPercent.toFixed(1)}%`);
      }
    } else {
      totalConsumptionPercent = distanceKm * adjustedConsumption;
      console.log(`[CONSUMPTION] ⚠️ Sin altimetría, consumo plano: ${totalConsumptionPercent.toFixed(1)}%`);
    }
    
    // 🔧 FIX: Agregar estimatedConsumption dentro de elevationData para que el frontend lo lea
    if (elevationData) {
      elevationData.estimatedConsumption = totalConsumptionPercent;
    }

    console.log('[ROUTE] ✅ Ruta calculada con', usedProvider.toUpperCase());
    console.log('[ROUTE]   Distancia:', distanceKm.toFixed(1), 'km');
    console.log('[ROUTE]   Duración:', Math.round(routeData.durationSeconds / 60), 'min');
    console.log('[ROUTE]   Puntos:', routeData.points.length);
    console.log('[ROUTE]   Steps:', routeData.steps.length);
    console.log('[ROUTE]   Consumo:', totalConsumptionPercent.toFixed(1), '%');

    const pointsArray = routeData.points.map(p => ({ lat: p.lat, lon: p.lon }));
    
    const response = {
      polyline: pointsArray,  // Nombre nuevo
      points: pointsArray,    // 🔧 FIX: Compatibilidad con Flutter (espera 'points')
      distance_km: distanceKm,
      duration_sec: routeData.durationSeconds,
      duration_min: routeData.durationSeconds / 60,  // 🔧 FIX: Compatibilidad con Flutter
      durationSeconds: routeData.durationSeconds,    // 🔧 FIX: Compatibilidad adicional
      steps: routeData.steps,
      elevation: elevationData,
      consumption_percent: totalConsumptionPercent,
      provider: usedProvider,
      vehicle: {
        id: vehicleId,
        battery_kwh: batteryKwh,
        consumption_rate: adjustedConsumption
      }
    };

    // Guardar en caché
    setCachedRoute(origin, destination, waypoints, response);

    return res.json(response);

  } catch (error) {
    console.error('[ROUTE] ❌ Error general:', error);
    return res.status(500).json({ 
      error: 'route_failed', 
      detail: error.message 
    });
  }
});
app.get('/tolls-in-route', async (req, res) => {
  try {
    const origin = String(req.query.from || '');
    const destination = String(req.query.to || '');
    const waypoints = req.query.waypoints ? String(req.query.waypoints) : null;

    if (!origin || !destination) {
      return res.status(400).json({ 
        error: 'BadRequest', 
        detail: 'from y to son requeridos (lat,lon)' 
      });
    }

    // Primero calculamos la ruta para obtener los puntos
    if (!HERE_API_KEY) {
      return res.status(500).json({ error: 'route_failed', detail: 'HERE_API_KEY faltante' });
    }

    const url = 'https://router.hereapi.com/v8/routes';
    const params = {
      transportMode: 'car',
      routingMode: 'fast',
      origin,
      destination,
      return: 'polyline',
      lang: 'es-ES',
      apiKey: HERE_API_KEY
    };

    // Agregar waypoints si existen
    let viaString = '';
    if (waypoints) {
      const waypointsList = waypoints.split('|');
      viaString = waypointsList.map(wp => `&via=${wp}!passThrough=true`).join('');
    }

    const queryString = new URLSearchParams(params).toString();
    const fullUrl = `${url}?${queryString}${viaString}`;

    const hereResp = await fetch(fullUrl);
    if (!hereResp.ok) {
      return res.status(hereResp.status).json({ 
        error: 'route_failed', 
        detail: 'Error obteniendo ruta de HERE' 
      });
    }

    const routeData = await hereResp.json();
    const sections = routeData?.routes?.[0]?.sections || [];
    
    // Extraer todos los puntos de la ruta
    let routePoints = [];
    for (const section of sections) {
      const polyline = section?.polyline || '';
      if (polyline) {
        const decoded = flex.decode(polyline);
        routePoints.push(...decoded.polyline.map(p => ({ lat: p[0], lon: p[1] })));
      }
    }

    if (routePoints.length === 0) {
      return res.json({ tolls: [], totalCost: 0, count: 0 });
    }

    console.log(`[PEAJES] 🔍 Analizando ruta con ${routePoints.length} puntos`);

    // Detectar peajes cercanos a la ruta Y calcular su distancia desde el origen
    const tollsOnRoute = [];
    
    for (const peaje of peajesData.peajes) {
      // Buscar el punto de la ruta más cercano al peaje
      let closestPointIndex = -1;
      let minDistance = Infinity;
      
      for (let i = 0; i < routePoints.length; i++) {
        const point = routePoints[i];
        const dist = haversineDistance(peaje.lat, peaje.lon, point.lat, point.lon);
        
        if (dist < minDistance) {
          minDistance = dist;
          closestPointIndex = i;
        }
      }
      
      // Si el punto más cercano está dentro del threshold (150m)
      if (minDistance <= 0.15) {
        // Calcular distancia acumulada desde el origen hasta este punto
        let distanceFromOrigin = 0;
        for (let i = 0; i < closestPointIndex; i++) {
          const p1 = routePoints[i];
          const p2 = routePoints[i + 1];
          distanceFromOrigin += haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
        }
        
        tollsOnRoute.push({
          id: peaje.id,
          nombre: peaje.nombre,
          lat: peaje.lat,
          lon: peaje.lon,
          via: peaje.via,
          tarifa: peaje.tarifa_cat1,
          distanceFromOrigin: Math.round(distanceFromOrigin * 1000) // Convertir a metros
        });
      }
    }
    
    // Ordenar peajes por distancia desde el origen
    tollsOnRoute.sort((a, b) => a.distanceFromOrigin - b.distanceFromOrigin);

    const totalCost = tollsOnRoute.reduce((sum, toll) => sum + toll.tarifa, 0);

    console.log(`[PEAJES] ✅ Encontrados ${tollsOnRoute.length} peajes, costo total: $${totalCost.toLocaleString('es-CO')}`);
    if (tollsOnRoute.length > 0) {
      console.log(`[PEAJES] 📍 Primer peaje: ${tollsOnRoute[0].nombre} a ${(tollsOnRoute[0].distanceFromOrigin / 1000).toFixed(1)} km`);
      console.log(`[PEAJES] 📍 Último peaje: ${tollsOnRoute[tollsOnRoute.length - 1].nombre} a ${(tollsOnRoute[tollsOnRoute.length - 1].distanceFromOrigin / 1000).toFixed(1)} km`);
    }

    res.json({
      tolls: tollsOnRoute,
      totalCost: totalCost,
      count: tollsOnRoute.length
    });

  } catch (error) {
    console.error('[PEAJES] ❌ Error:', error.message);
    res.status(500).json({ 
      error: 'tolls_failed', 
      detail: error.message 
    });
  }
});

// ==================== EV ROUTING (HERE EV API) ====================
// Endpoint para calcular rutas optimizadas para vehículos eléctricos
// Usa HERE Routing API v8 con parámetros EV para calcular paradas de carga automáticas

app.get('/ev-route', async (req, res) => {
  try {
    const origin = String(req.query.from || req.query.origin || '');
    const destination = String(req.query.to || req.query.destination || '');
    const lang = String(req.query.lang || 'es-ES');
    const debug = req.query.debug != null;

    // Parámetros del vehículo eléctrico
    const initialCharge = Number(req.query.initialCharge) || 80; // kWh de carga inicial
    const maxCharge = Number(req.query.maxCharge) || 100; // Capacidad máxima en kWh
    const connectorType = String(req.query.connectorType || 'iec62196Type2Combo'); // CCS2 por defecto
    
    // Consumo del vehículo (kWh/km a diferentes velocidades)
    // Formato: velocidad1,consumo1,velocidad2,consumo2,...
    const freeFlowSpeedTable = String(req.query.freeFlowSpeedTable || 
      '0,0.168,27,0.168,45,0.183,60,0.196,75,0.207,90,0.238,100,0.26,110,0.296,120,0.337,130,0.38');
    
    // Curva de carga (kWh, kW) - potencia de carga a diferentes niveles
    const chargingCurve = String(req.query.chargingCurve || 
      '0,100,20,95,40,90,60,80,70,65,80,50,90,30,95,15,100,5');
    
    // Consumo auxiliar (clima, etc) en kW
    const auxiliaryConsumption = Number(req.query.auxiliaryConsumption) || 1.5;
    
    // Consumo por elevación (Wh/m)
    const ascent = Number(req.query.ascent) || 9;
    const descent = Number(req.query.descent) || 4.3;
    
    // Límites de carga (como porcentaje de maxCharge, no valores absolutos)
    // HERE espera estos valores en la misma unidad que maxCharge
    const maxChargeAfterChargingStation = Math.min(
      Number(req.query.maxChargeAfterStation) || Math.round(maxCharge * 0.8), 
      maxCharge
    );
    const minChargeAtChargingStation = Math.min(
      Number(req.query.minChargeAtStation) || Math.round(maxCharge * 0.1), 
      maxCharge
    );
    const minChargeAtDestination = Math.min(
      Number(req.query.minChargeAtDestination) || Math.round(maxCharge * 0.1), 
      maxCharge
    );

    console.log('[EV-ROUTE] ⚡ Calculando ruta EV:');
    console.log('[EV-ROUTE]   Origen:', origin);
    console.log('[EV-ROUTE]   Destino:', destination);
    console.log('[EV-ROUTE]   Carga inicial:', initialCharge, 'kWh');
    console.log('[EV-ROUTE]   Capacidad:', maxCharge, 'kWh');
    console.log('[EV-ROUTE]   Conector:', connectorType);

    if (!origin || !destination) {
      return res.status(400).json({ 
        error: 'BadRequest', 
        detail: 'origin/from y destination/to son requeridos (lat,lon)' 
      });
    }
    if (!HERE_API_KEY) {
      return res.status(500).json({ 
        error: 'ev_route_failed', 
        detail: 'HERE_API_KEY faltante' 
      });
    }

    const url = 'https://router.hereapi.com/v8/routes';
    
    const params = {
      transportMode: 'car',
      routingMode: 'fast',
      origin,
      destination,
      return: 'summary,polyline,actions,instructions,turnByTurnActions',
      lang,
      apiKey: HERE_API_KEY,
      
      // ⚡ Parámetros EV
      'ev[makeReachable]': 'true',
      'ev[initialCharge]': initialCharge,
      'ev[maxCharge]': maxCharge,
      'ev[chargingCurve]': chargingCurve,
      'ev[connectorTypes]': connectorType,
      'ev[freeFlowSpeedTable]': freeFlowSpeedTable,
      'ev[auxiliaryConsumption]': auxiliaryConsumption,
      'ev[ascent]': ascent,
      'ev[descent]': descent,
      'ev[maxChargeAfterChargingStation]': maxChargeAfterChargingStation,
      'ev[minChargeAtChargingStation]': minChargeAtChargingStation,
      'ev[minChargeAtDestination]': minChargeAtDestination
    };

    console.log('[EV-ROUTE] 📡 Llamando a HERE EV Routing API...');
    const startTime = Date.now();
    
    const r = await axios.get(url, { params, timeout: 30000 });
    
    const elapsed = Date.now() - startTime;
    console.log(`[EV-ROUTE] ⏱️  Respuesta en ${elapsed}ms`);
    
    // Log de la respuesta de HERE
    console.log('[EV-ROUTE] 📦 Respuesta HERE routes:', r.data?.routes?.length || 0);
    
    if (debug) return res.json(r.data);

    const route = r.data?.routes?.[0];
    if (!route) {
      console.log('[EV-ROUTE] ❌ HERE no devolvió rutas. Data:', JSON.stringify(r.data).substring(0, 500));
      return res.status(502).json({ 
        error: 'NoRoute', 
        detail: 'HERE no devolvió rutas para vehículos eléctricos. Puede que no haya cargadores disponibles en la ruta.',
        hereResponse: r.data
      });
    }
    
    console.log('[EV-ROUTE] ✅ Ruta encontrada con', route.sections?.length || 0, 'secciones');

    // Procesar secciones
    const sections = route.sections || [];
    let allPoints = [];
    let totalDistance = 0;
    let totalDuration = 0;
    const chargingStops = [];

    console.log(`[EV-ROUTE] 📍 Procesando ${sections.length} secciones...`);

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const sectionType = section.type || 'vehicle';
      
      // Decodificar polyline
      if (section.polyline) {
        try {
          const sectionPoints = decodeFlexToPoints(section.polyline);
          if (allPoints.length > 0 && sectionPoints.length > 0) {
            allPoints = allPoints.concat(sectionPoints.slice(1));
          } else {
            allPoints = allPoints.concat(sectionPoints);
          }
        } catch (e) {
          console.error('[EV-ROUTE] Error decodificando polyline:', e.message);
        }
      }
      
      const summary = section.summary || {};
      totalDistance += Number(summary.length) || 0;
      totalDuration += Number(summary.duration) || 0;
      
      // Extraer paradas de carga
      const postActions = section.postActions || [];
      const chargingAction = postActions.find(a => a.action === 'charging');
      
      if (chargingAction) {
        const arrival = section.arrival || {};
        const place = arrival.place || {};
        const location = place.location || {};
        const chargingStation = place.chargingStation || {};
        
        chargingStops.push({
          index: chargingStops.length + 1,
          lat: location.lat,
          lon: location.lng,
          name: chargingStation.name || place.name || 'Estación de carga',
          address: place.address?.label || '',
          operator: chargingStation.operator?.name || chargingStation.brand?.name || '',
          arrivalCharge: chargingAction.arrivalCharge,
          targetCharge: chargingAction.targetCharge,
          chargingTime: chargingAction.duration,
          chargingPower: chargingAction.chargingPower,
          connectors: (chargingStation.connectors || []).map(c => ({
            type: c.connectorType?.id || c.type,
            power: c.maxPowerInKw,
            current: c.currentType
          })),
          arrivalSoc: maxCharge > 0 ? Math.round((chargingAction.arrivalCharge / maxCharge) * 100) : 0,
          targetSoc: maxCharge > 0 ? Math.round((chargingAction.targetCharge / maxCharge) * 100) : 80,
          chargeTimeMin: Math.round((chargingAction.duration || 0) / 60)
        });
        
        console.log(`[EV-ROUTE]   ⚡ Cargador ${chargingStops.length}: ${chargingStation.name || 'N/A'}`);
        console.log(`[EV-ROUTE]      ${chargingAction.arrivalCharge}→${chargingAction.targetCharge} kWh, ${Math.round((chargingAction.duration || 0) / 60)} min`);
      }
    }

    const finalCharge = sections[sections.length - 1]?.arrival?.charge;
    const finalSoc = finalCharge && maxCharge > 0 ? Math.round((finalCharge / maxCharge) * 100) : null;
    const totalChargingTime = chargingStops.reduce((sum, stop) => sum + (stop.chargingTime || 0), 0);

    console.log('[EV-ROUTE] ✅ Ruta EV calculada:');
    console.log('[EV-ROUTE]   Distancia:', (totalDistance / 1000).toFixed(1), 'km');
    console.log('[EV-ROUTE]   Duración:', Math.round(totalDuration / 60), 'min');
    console.log('[EV-ROUTE]   Paradas:', chargingStops.length);
    console.log('[EV-ROUTE]   SOC final:', finalSoc, '%');

    res.json({
      provider: 'here_ev',
      success: true,
      distanceMeters: totalDistance,
      durationSeconds: totalDuration,
      totalDurationSeconds: totalDuration + totalChargingTime,
      hasPolyline: allPoints.length > 0,
      points: allPoints,
      energy: {
        initialCharge,
        finalCharge: finalCharge || 0,
        initialSoc: maxCharge > 0 ? Math.round((initialCharge / maxCharge) * 100) : 0,
        finalSoc: finalSoc || 0,
        maxCharge
      },
      chargingStops,
      totalChargingStops: chargingStops.length,
      totalChargingTimeMinutes: Math.round(totalChargingTime / 60)
    });

  } catch (err) {
    console.error('[EV-ROUTE] ❌ Error:', err.message);
    console.error('[EV-ROUTE] ❌ Response data:', JSON.stringify(err?.response?.data, null, 2));
    console.error('[EV-ROUTE] ❌ Status:', err?.response?.status);
    
    const status = Number(err?.response?.status) || 500;
    const hereError = err?.response?.data;
    
    let detail = String(err?.message || err);
    let errorCode = 'ev_route_failed';
    
    if (hereError) {
      if (hereError.title === 'Route not found' || hereError.cause === 'No route found') {
        errorCode = 'no_route';
        detail = 'No se encontró una ruta viable con los cargadores disponibles.';
      } else {
        detail = hereError.title || hereError.message || JSON.stringify(hereError);
      }
    }
    
    res.status(status).json({ error: errorCode, detail, hereResponse: hereError });
  }
});

// ==================== CALIBRACIÓN COLABORATIVA ====================

// Endpoint para recibir reportes de viajes reales
app.post('/api/calibration-report', (req, res) => {
  try {
    const report = req.body;
    
    // Validar datos básicos
    if (!report.vehicle_id || !report.battery || !report.route) {
      return res.status(400).json({ 
        error: 'Datos incompletos', 
        required: ['vehicle_id', 'battery', 'route'] 
      });
    }
    
    // Calcular consumo real del usuario
    const distanceKm = report.route.distance_km || 0;
    const consumed = report.battery.consumed_percent || 0;
    const realConsumptionRate = distanceKm > 0 ? consumed / distanceKm : 0;
    
    // Crear registro completo
    const calibrationData = {
      ...report,
      calculated_consumption_rate: realConsumptionRate,
      received_at: new Date().toISOString(),
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    // Guardar reporte
    calibrationReports.push(calibrationData);
    
    // Logs detallados
    console.log('\n========================================');
    console.log('[CALIBRATION] 📊 NUEVO REPORTE RECIBIDO');
    console.log('========================================');
    console.log(`🚗 Vehículo: ${report.vehicle_id}`);
    console.log(`📍 Ruta: ${report.route.origin || 'N/A'} → ${report.route.destination || 'N/A'}`);
    console.log(`📏 Distancia: ${distanceKm.toFixed(1)} km`);
    console.log(`🔋 Batería: ${report.battery.initial_percent}% → ${report.battery.final_percent}%`);
    console.log(`📉 Consumo: ${consumed.toFixed(1)}%`);
    console.log(`🎯 Consumo real: ${realConsumptionRate.toFixed(4)}%/km`);
    console.log(`📈 Predicción app: ${report.prediction?.estimated_arrival || 'N/A'}%`);
    console.log(`⚖️  Error: ${report.prediction?.error_percent?.toFixed(1) || 'N/A'}%`);
    console.log(`📊 Total reportes: ${calibrationReports.length}`);
    console.log('========================================\n');
    
    res.json({
      success: true,
      message: '¡Gracias por ayudar a mejorar EcoDrive! 💚',
      report_id: calibrationData.id,
      total_reports: calibrationReports.length
    });
    
  } catch (error) {
    console.error('[CALIBRATION] ❌ Error:', error);
    res.status(500).json({ 
      error: 'Error al guardar reporte',
      detail: error.message 
    });
  }
});

// Endpoint para obtener estadísticas (admin/desarrollo)
app.get('/api/calibration-stats', (req, res) => {
  try {
    const vehicleId = req.query.vehicle_id;
    
    let filteredReports = calibrationReports;
    if (vehicleId) {
      filteredReports = calibrationReports.filter(r => r.vehicle_id === vehicleId);
    }
    
    if (filteredReports.length === 0) {
      return res.json({ 
        message: 'No hay reportes disponibles',
        total_reports: 0
      });
    }
    
    // Calcular estadísticas
    const avgConsumption = filteredReports.reduce((sum, r) => 
      sum + (r.calculated_consumption_rate || 0), 0
    ) / filteredReports.length;
    
    const avgError = filteredReports.reduce((sum, r) => 
      sum + Math.abs(r.prediction?.error_percent || 0), 0
    ) / filteredReports.length;
    
    // Agrupar por vehículo
    const byVehicle = {};
    filteredReports.forEach(r => {
      if (!byVehicle[r.vehicle_id]) {
        byVehicle[r.vehicle_id] = {
          count: 0,
          totalConsumption: 0,
          totalError: 0
        };
      }
      byVehicle[r.vehicle_id].count++;
      byVehicle[r.vehicle_id].totalConsumption += r.calculated_consumption_rate || 0;
      byVehicle[r.vehicle_id].totalError += Math.abs(r.prediction?.error_percent || 0);
    });
    
    const vehicleStats = Object.keys(byVehicle).map(vId => ({
      vehicle_id: vId,
      reports: byVehicle[vId].count,
      avg_consumption: (byVehicle[vId].totalConsumption / byVehicle[vId].count).toFixed(4),
      avg_error: (byVehicle[vId].totalError / byVehicle[vId].count).toFixed(2)
    }));
    
    res.json({
      filter: vehicleId || 'all',
      total_reports: filteredReports.length,
      avg_consumption_rate: avgConsumption.toFixed(4),
      avg_error_percent: avgError.toFixed(2),
      by_vehicle: vehicleStats,
      recent_reports: filteredReports.slice(-10).reverse().map(r => ({
        id: r.id,
        vehicle: r.vehicle_id,
        route: `${r.route.origin || 'N/A'} → ${r.route.destination || 'N/A'}`,
        distance_km: r.route.distance_km,
        consumption_rate: r.calculated_consumption_rate?.toFixed(4),
        error_percent: r.prediction?.error_percent?.toFixed(1),
        date: r.received_at
      }))
    });
    
  } catch (error) {
    console.error('[CALIBRATION] ❌ Error stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ==================== SISTEMA DE REPORTES DE TRÁFICO ====================

// Base de datos en memoria para reportes (en producción: usar MongoDB/PostgreSQL)
let trafficReports = [];

// Endpoint para reportar incidentes
app.post('/api/traffic-report', (req, res) => {
  try {
    const { type, lat, lon, description, severity } = req.body;
    
    // Validar datos
    if (!type || !lat || !lon) {
      return res.status(400).json({ 
        error: 'Faltan datos requeridos', 
        required: ['type', 'lat', 'lon'] 
      });
    }
    
    // Crear reporte
    const report = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type, // 'accident', 'police', 'construction', 'hazard', 'traffic'
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      description: description || '',
      severity: severity || 'medium', // 'low', 'medium', 'high'
      votes: 1, // Sistema de votación
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // Expira en 2 horas
    };
    
    trafficReports.push(report);
    
    console.log('\n========================================');
    console.log('[TRAFFIC-REPORT] 🚨 NUEVO REPORTE');
    console.log('========================================');
    console.log(`📍 Tipo: ${type}`);
    console.log(`📌 Ubicación: ${lat}, ${lon}`);
    console.log(`⚠️  Severidad: ${severity}`);
    console.log(`💬 Descripción: ${description || 'N/A'}`);
    console.log(`📊 Total reportes: ${trafficReports.length}`);
    console.log('========================================\n');
    
    res.json({
      success: true,
      message: '¡Gracias por tu reporte!',
      report_id: report.id,
      total_reports: trafficReports.length
    });
    
  } catch (error) {
    console.error('[TRAFFIC-REPORT] ❌ Error:', error);
    res.status(500).json({ 
      error: 'Error al guardar reporte',
      detail: error.message 
    });
  }
});

// Endpoint para consultar reportes cercanos
app.get('/api/traffic-reports-nearby', (req, res) => {
  try {
    const { lat, lon, radius } = req.query;
    
    if (!lat || !lon) {
      return res.status(400).json({ error: 'Faltan parámetros: lat, lon' });
    }
    
    const centerLat = parseFloat(lat);
    const centerLon = parseFloat(lon);
    const radiusKm = parseFloat(radius) || 10; // 10 km por defecto
    const now = new Date();
    
    // Filtrar reportes: cercanos y no expirados
    const nearbyReports = trafficReports.filter(report => {
      // Verificar si expiró
      if (new Date(report.expiresAt) < now) {
        return false;
      }
      
      // Calcular distancia
      const distance = haversineDistance(centerLat, centerLon, report.lat, report.lon);
      return distance <= radiusKm;
    });
    
    // Ordenar por severidad y tiempo
    const sorted = nearbyReports.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    res.json({
      success: true,
      count: sorted.length,
      radius_km: radiusKm,
      reports: sorted
    });
    
  } catch (error) {
    console.error('[TRAFFIC-REPORTS-NEARBY] ❌ Error:', error);
    res.status(500).json({ error: 'Error al consultar reportes' });
  }
});

// Endpoint para votar en un reporte (validar si sigue activo)
app.post('/api/traffic-report-vote', (req, res) => {
  try {
    const { report_id, vote } = req.body; // vote: 1 (confirmar) o -1 (ya no existe)
    
    const report = trafficReports.find(r => r.id === report_id);
    if (!report) {
      return res.status(404).json({ error: 'Reporte no encontrado' });
    }
    
    report.votes += vote;
    
    // Si tiene muchos votos negativos, eliminar
    if (report.votes <= -3) {
      const index = trafficReports.indexOf(report);
      trafficReports.splice(index, 1);
      console.log(`[TRAFFIC-REPORT] 🗑️  Reporte ${report_id} eliminado por votos negativos`);
    }
    
    res.json({
      success: true,
      votes: report.votes
    });
    
  } catch (error) {
    console.error('[TRAFFIC-REPORT-VOTE] ❌ Error:', error);
    res.status(500).json({ error: 'Error al votar' });
  }
});

// Limpiar reportes expirados cada hora
setInterval(() => {
  const now = new Date();
  const before = trafficReports.length;
  
  // Filtrar reportes no expirados
  for (let i = trafficReports.length - 1; i >= 0; i--) {
    if (new Date(trafficReports[i].expiresAt) < now) {
      trafficReports.splice(i, 1);
    }
  }
  
  const after = trafficReports.length;
  if (before !== after) {
    console.log(`[TRAFFIC-REPORTS] 🗑️  Limpiados ${before - after} reportes expirados. Quedan: ${after}`);
  }
}, 60 * 60 * 1000); // Cada hora


// ============================================================================
// ENDPOINTS PARA LA APP (sin /api prefix)
// ============================================================================
app.post('/traffic-reports', (req, res) => {
  try {
    const { type, latitude, longitude, description, timestamp } = req.body;
    
    if (!type || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
    
    const report = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      lat: parseFloat(latitude),
      lon: parseFloat(longitude),
      description: description || '',
      severity: type.includes('Heavy') ? 'high' : 'medium',
      votes: 1,
      timestamp: timestamp || new Date().toISOString(),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    };
    
    trafficReports.push(report);
    console.log(`[TRAFFIC-REPORTS] ✅ Nuevo: ${type} en ${latitude},${longitude} (Total: ${trafficReports.length})`);
    
    res.status(201).json({ success: true, report });
  } catch (error) {
    console.error('[TRAFFIC-REPORTS] ❌', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/traffic-reports', (req, res) => {
  try {
    const now = new Date();
    let activeReports = trafficReports.filter(r => new Date(r.expiresAt) > now);
    res.json({ success: true, reports: activeReports, total: activeReports.length });
    
    // Ordenar por timestamp DESC (más recientes primero)
    activeReports.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Limitar a 100 reportes
    activeReports = activeReports.slice(0, 100);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== errores globales =====
process.on('uncaughtException', e => console.error('UNCAUGHT', e));
process.on('unhandledRejection', e => console.error('UNHANDLED', e));

// ======== START LISTEN ========
(async () => {
  try {
    PORT = await pickPort();
    trafficReports = trafficReports.filter(r => r.lat != null && r.lon != null);
console.log(`[STARTUP] 🗑️ Reportes sin coordenadas eliminados. Quedan: ${trafficReports.length}`);
    httpServer.listen(PORT, '0.0.0.0', () => {
      const ifaces = Object.values(os.networkInterfaces()).flat().filter(Boolean);
      const wifi = ifaces.find(i => i.family === 'IPv4' && !i.internal);
      console.log('EV backend listening:');
      console.log(' • Local (PC):   http://127.0.0.1:' + PORT);
      console.log(' • Emulador AVD: http://10.0.2.2:'   + PORT);
      if (wifi) console.log(' • LAN (Wi-Fi): http://' + wifi.address + ':' + PORT);
      console.log('Providers: routing=HERE, places=MapTiler+HERE+Nominatim+Overpass, traffic=HERE');
      console.log('[WS] WebSocket server ready for real-time updates');
    });
  } catch (e) { console.error('Error arrancando el server:', e); }
})();

// ===== LIMPIEZA AUTOMÁTICA DE DATOS EXPIRADOS =====
// ===== LIMPIEZA DE CACHE DE USUARIOS =====
setInterval(() => {
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  let cleaned = 0;
  
  for (const [userIP, sites] of userUpdateCache.entries()) {
    for (const [siteId, data] of sites.entries()) {
      if (data.lastUpdate < oneHourAgo) {
        sites.delete(siteId);
        cleaned++;
      }
    }
    
    if (sites.size === 0) {
      userUpdateCache.delete(userIP);
    }
  }
  
  if (cleaned > 0) {
    console.log(`[SPAM] ✅ Limpiados ${cleaned} registros de usuarios antiguos`);
  }
}, 60 * 60 * 1000);


// 🆕 Endpoint para limpiar cache de elevación (útil para desarrollo)
app.post("/admin/clear-elevation-cache", (req, res) => {
  const size = elevationCache.size;
  elevationCache.clear();
  console.log(`[ADMIN] 🗑️  Cache de elevación limpiado (${size} entradas)`);
  res.json({ cleared: size, message: "Cache limpiado exitosamente" });
});


// 🆕 ENDPOINT DELETE - Limpiar reportes corruptos
app.delete('/traffic-reports', (req, res) => {
  try {
    const { invalidOnly } = req.query;
    
    if (invalidOnly === 'true') {
      const before = trafficReports.length;
      for (let i = trafficReports.length - 1; i >= 0; i--) {
        if (trafficReports[i].lat == null || trafficReports[i].lon == null) {
          trafficReports.splice(i, 1);
        }
      }
      const deleted = before - trafficReports.length;
      console.log(`[DELETE] 🗑️  Eliminados ${deleted} reportes sin coordenadas`);
      return res.json({ success: true, deleted, remaining: trafficReports.length });
    } else {
      const deleted = trafficReports.length;
      trafficReports.length = 0;
      console.log(`[DELETE] 🗑️  Eliminados TODOS (${deleted})`);
      return res.json({ success: true, deleted });
    }
  } catch (error) {
    console.error('[DELETE] ❌', error);
    res.status(500).json({ error: error.message });
  }
});
