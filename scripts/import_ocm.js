// scripts/import_ocm.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATA_DIR = path.join(__dirname, '..', 'data');
const COUNTRY = process.env.EV_COUNTRY_CODE || 'CO';
const OCM_API_KEY = process.env.OCM_API_KEY || '';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function normalizeOcmItem(it) {
  const addrInfo = it.AddressInfo || {};
  const connections = Array.isArray(it.Connections) ? it.Connections : [];
  let powerKw = null;
  for (const c of connections) {
    if (typeof c.PowerKW === 'number') powerKw = Math.max(powerKw ?? 0, c.PowerKW);
    else if (c.Amps && c.Voltage) powerKw = Math.max(powerKw ?? 0, (c.Amps * c.Voltage) / 1000);
  }
  const connectors = connections.map(c => ({
    type: c.ConnectionType ? (c.ConnectionType.FormalName || c.ConnectionType.Title || 'Desconocido') : 'Desconocido',
    level: c.Level ? (c.Level.Title || `L${c.Level.ID}`) : null,
    power_kw: typeof c.PowerKW === 'number' ? c.PowerKW : null,
    current: c.CurrentType ? (c.CurrentType.Title || null) : null,
    quantity: typeof c.Quantity === 'number' ? c.Quantity : 1,
  }));
  const statusTitle = it.StatusType ? (it.StatusType.IsOperational ? 'Operational' : (it.StatusType.Title || 'Unknown')) : 'Unknown';
  const isOperational = it.StatusType ? !!it.StatusType.IsOperational : true;

  return {
    id: it.ID ? `ocm:${it.ID}` : `ocm:${Math.random().toString(36).slice(2)}`,
    name: addrInfo.Title || it.OperatorInfo?.Title || 'Punto de carga',
    address: [addrInfo.AddressLine1, addrInfo.AddressLine2, addrInfo.Town, addrInfo.StateOrProvince].filter(Boolean).join(', '),
    lat: Number(addrInfo.Latitude),
    lon: Number(addrInfo.Longitude),
    network: it.OperatorInfo ? (it.OperatorInfo.Title || null) : null,
    status: statusTitle,
    is_operational: isOperational,
    last_updated: it.DateLastStatusUpdate || it.DateLastVerified || it.DateLastConfirmed || it.DateCreated || null,
    power_kw: powerKw,
    connectors,
    provider: 'ocm',
  };
}

async function fetchOcmCountry({ countryCode, maxresults = 10000 }) {
  const url = 'https://api.openchargemap.io/v3/poi';
  const params = {
    key: OCM_API_KEY || undefined,   // también lo mandamos en header
    countrycode: countryCode,
    compact: true,
    verbose: false,
    maxresults: String(maxresults),
  };
  const headers = {
    'User-Agent': 'EcoDriveApp/1.0 (+contacto@panoramaautomotor.com)',
    ...(OCM_API_KEY ? { 'X-API-Key': OCM_API_KEY } : {}),
    'Accept': 'application/json',
  };

  try {
    const { data } = await axios.get(url, { params, headers, timeout: 60000 });
    return Array.isArray(data) ? data : [];
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    console.error('[OCM] ERROR', status, body ?? err.message);
    if (status === 403) {
      console.error('→ 403 Forbidden: usualmente falta API key o el User-Agent. Verifica OCM_API_KEY en .env.');
    }
    if (status === 429) {
      console.error('→ 429 Rate limit: baja maxresults o intenta en partes (por regiones/bbox).');
    }
    throw err;
  }
}

(async () => {
  try {
    console.log(`[OCM] Descargando dataset país=${COUNTRY} ...`);
    const raw = await fetchOcmCountry({ countryCode: COUNTRY, maxresults: 10000 });
    const rawPath = path.join(DATA_DIR, `chargers_${COUNTRY}_raw.json`);
    fs.writeFileSync(rawPath, JSON.stringify(raw, null, 2));
    console.log(`[OCM] Guardado RAW: ${rawPath} (items=${raw.length})`);

    const norm = raw.map(normalizeOcmItem).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    const outPath = path.join(DATA_DIR, `chargers_${COUNTRY}.json`);
    fs.writeFileSync(outPath, JSON.stringify(norm, null, 2));
    console.log(`[OCM] Normalizado: ${outPath} (items=${norm.length})`);
    console.log(`[OCM] Listo. Tu backend ahora servirá /ev/chargers con el dataset local.`);
  } catch (e) {
    process.exit(1);
  }
})();
