// api/monitor-proxy.js — Proxy Vercel para APIs de inversores solares
// Evita restrições de CORS chamando as APIs do servidor

const https = require('https');
const http  = require('http');
const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { brand, platId, api, action } = req.body || {};
  if (!api || typeof api !== 'object') return res.status(400).json({ error: 'Credenciais (api) ausentes' });

  // ── Ação: refresh em lote (status + dados de todas as plantas) ──
  if (action === 'refresh_all') {
    if (!brand) return res.status(400).json({ error: 'brand obrigatório' });
    try {
      let plants;
      switch (brand) {
        case 'solis':     plants = await refreshAllSolis(api);    break;
        case 'solarman':
        case 'sofar':
        case 'deye':
        case 'intelbras': plants = await refreshAllSolarman(api); break;
        default: return res.status(400).json({ error: 'refresh_all não disponível para: ' + brand });
      }
      return res.status(200).json({ plants });
    } catch (err) {
      console.error('[monitor-proxy refresh_all]', brand, err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Ação: listar todas as plantas da conta ───────────────
  if (action === 'list') {
    if (!brand) return res.status(400).json({ error: 'brand obrigatório' });
    try {
      let plants;
      switch (brand) {
        case 'solarman':
        case 'sofar':
        case 'deye':
        case 'intelbras': plants = await listSolarman(api); break;
        case 'growatt':   plants = await listGrowatt(api);  break;
        case 'huawei':    plants = await listHuawei(api);   break;
        case 'solis':     plants = await listSolis(api);    break;
        case 'solplanet': plants = await listSolplanet(api);break;
        case 'foxess':    plants = await listFoxess(api);   break;
        case 'goodwe':    plants = await listGoodwe(api);   break;
        case 'saj':       plants = await listSaj(api);      break;
        case 'sungrow':   plants = await listSungrow(api);  break;
        default: return res.status(400).json({ error: 'Listagem não disponível para: ' + brand });
      }
      return res.status(200).json({ plants });
    } catch (err) {
      // Coloca a mensagem de erro PRIMEIRO para aparecer na tabela do Vercel (truncada em ~28 chars)
      console.error('[list-err]', err.message.slice(0, 200));
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Ação: buscar info da usina (cidade, estado, kWp, SN do inversor) ──
  if (action === 'fetch_info') {
    if (!brand || !platId) return res.status(400).json({ error: 'brand e platId são obrigatórios' });
    try {
      let info;
      switch (brand) {
        case 'solis':                                    info = await fetchInfoSolis(platId, api);    break;
        case 'solarman':
        case 'sofar':
        case 'deye':
        case 'intelbras':                                info = await fetchInfoSolarman(platId, api); break;
        default: return res.status(400).json({ error: 'fetch_info não disponível para: ' + brand });
      }
      return res.status(200).json(info);
    } catch (err) {
      console.error('[fetch_info]', brand, err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Ação: buscar SN do inversor (rápido, sem listar station list) ──
  if (action === 'fetch_sn') {
    if (!brand || !platId) return res.status(400).json({ error: 'brand e platId obrigatórios' });
    try {
      let snData;
      if (brand === 'solis') {
        snData = await fetchSnSolis(platId, api);
      } else if (['solarman','sofar','deye','intelbras'].includes(brand)) {
        snData = await fetchSnSolarman(platId, api);
      } else {
        return res.status(400).json({ error: 'fetch_sn não disponível para: ' + brand });
      }
      return res.status(200).json(snData);
    } catch (err) {
      console.error('[fetch_sn]', brand, err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Ação: reverse geocoding de coordenadas (usado pelo bulk button) ──
  if (action === 'geocode') {
    const { lat, lng } = req.body || {};
    if (!lat || !lng) return res.status(400).json({ error: 'lat e lng obrigatórios' });
    try {
      const geo = await reverseGeocode(parseFloat(lat), parseFloat(lng));
      return res.status(200).json({ cidade: geo.cidade, estado: geo.estado });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!brand || !platId) return res.status(400).json({ error: 'brand e platId são obrigatórios' });

  try {
    let data;
    switch (brand) {
      case 'solarman':  data = await fetchSolarman(platId, api); break;
      case 'growatt':   data = await fetchGrowatt(platId, api);  break;
      case 'huawei':    data = await fetchHuawei(platId, api);   break;
      case 'solis':     data = await fetchSolis(platId, api);    break;
      case 'sofar':     data = await fetchSolarman(platId, api, 'sofar'); break;
      case 'deye':      data = await fetchSolarman(platId, api, 'deye');  break;
      case 'solplanet': data = await fetchSolplanet(platId, api);break;
      case 'fronius':   data = await fetchFronius(platId, api);  break;
      case 'auxsol':    data = await fetchAuxsol(platId, api);   break;
      case 'intelbras': data = await fetchSolarman(platId, api, 'intelbras'); break;
      case 'sungrow':   data = await fetchSungrow(platId, api);  break;
      case 'hoymiles':  data = await fetchHoymiles(platId, api); break;
      case 'goodwe':    data = await fetchGoodwe(platId, api);   break;
      case 'sma':       data = await fetchSma(platId, api);      break;
      case 'foxess':    data = await fetchFoxess(platId, api);   break;
      case 'saj':       data = await fetchSaj(platId, api);      break;
      default: return res.status(400).json({ error: 'Marca não suportada para API automática: ' + brand });
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error('[monitor-proxy]', brand, err.message);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
};

// ── Helpers HTTP ─────────────────────────────────────────
function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers }
    };
    const mod = parsed.protocol === 'https:' ? https : http;
    const reqH = mod.request(opts, r => {
      let data = '';
      r.on('data', c => data += c);
      r.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(data); } });
    });
    reqH.on('error', reject);
    reqH.write(payload);
    reqH.end();
  });
}

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...headers }
    };
    const mod = parsed.protocol === 'https:' ? https : http;
    const reqH = mod.request(opts, r => {
      let data = '';
      r.on('data', c => data += c);
      r.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(data); } });
    });
    reqH.on('error', reject);
    reqH.end();
  });
}

// Retorna v se for string não-numérica; caso contrário ''
function textVal(v) {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v).trim();
  return (s && isNaN(s)) ? s : '';
}

// httpGet com timeout (ms) — evita travar a função Vercel
function httpGetTimed(url, headers = {}, ms = 6000) {
  const timer = new Promise((_, rej) => setTimeout(() => rej(new Error('geocode timeout')), ms));
  return Promise.race([httpGet(url, headers), timer]);
}

// Mapa de estados brasileiros → código UF (para converter "Rio Grande do Norte" → "RN")
const _BR_ESTADOS = {
  'acre':'AC','alagoas':'AL','amapá':'AP','amapa':'AP','amazonas':'AM','bahia':'BA',
  'ceará':'CE','ceara':'CE','distrito federal':'DF','espírito santo':'ES','espirito santo':'ES',
  'goiás':'GO','goias':'GO','maranhão':'MA','maranhao':'MA','mato grosso do sul':'MS',
  'mato grosso':'MT','minas gerais':'MG','pará':'PA','para':'PA','paraíba':'PB','paraiba':'PB',
  'paraná':'PR','parana':'PR','pernambuco':'PE','piauí':'PI','piaui':'PI',
  'rio de janeiro':'RJ','rio grande do norte':'RN','rio grande do sul':'RS',
  'rondônia':'RO','rondonia':'RO','roraima':'RR','santa catarina':'SC',
  'são paulo':'SP','sao paulo':'SP','sergipe':'SE','tocantins':'TO'
};
function _stateToCode(name) {
  if (!name) return '';
  return _BR_ESTADOS[name.trim().toLowerCase()] || '';
}

// Retorna true se o nome for um estado brasileiro conhecido
function _isStateName(name) {
  return !!(name && _BR_ESTADOS[name.trim().toLowerCase()]);
}

// Extrai nome do município de uma resposta do BigDataCloud
// Rejeita apenas nomes que sabidamente são estados (via _BR_ESTADOS), não por comparação com
// principalSubdivision (que pode ser o próprio município em áreas urbanas)
function _bdcMunicipio(r) {
  const adm = (r.localityInfo && r.localityInfo.administrative) || [];

  // adminLevel 8 = município no Brasil — mais confiável
  const lvl8 = adm.find(a => a.adminLevel === 8);
  if (lvl8 && lvl8.name && !_isStateName(lvl8.name)) return lvl8.name.trim();

  // r.city — aceita qualquer nome que não seja estado conhecido
  const city = (r.city || '').trim();
  if (city && !_isStateName(city)) return city;

  // r.locality como última opção dentro do BDC
  const loc = (r.locality || '').trim();
  if (loc && !_isStateName(loc)) return loc;

  return '';
}

// Extrai estado (UF) de uma resposta do BigDataCloud
function _bdcEstado(r) {
  const raw = (r.principalSubdivisionCode || '').toUpperCase();
  if (raw.includes('-')) return raw.split('-').pop();
  const uf = raw.slice(0, 2);
  return uf || _stateToCode(r.principalSubdivision || '');
}

// Reverse geocoding: BigDataCloud → Photon (Komoot/OSM) → Nominatim
// IMPORTANTE: só retorna cedo se tiver CIDADE — estado sozinho não basta
async function reverseGeocode(lat, lng) {
  // 1. BigDataCloud — rápido, sem chave, bom para cidades maiores
  try {
    const r = await httpGetTimed(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=pt`,
      {}, 5000
    );
    if (r) {
      const cidade = _bdcMunicipio(r);
      const estado = _bdcEstado(r);
      if (cidade) return { cidade, estado };  // só retorna se tiver município real
    }
  } catch(e) { /* continua para próximo serviço */ }

  // 2. Photon (Komoot) — baseado em OSM, sem chave, boa cobertura de municípios BR rurais
  try {
    const r = await httpGetTimed(
      `https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}&lang=pt`,
      { 'User-Agent': 'GS360-Solar-Monitor/1.0' }, 7000
    );
    const props = (r && r.features && r.features[0] && r.features[0].properties) || null;
    if (props) {
      // city = município; county = município em áreas rurais BR; name = nome do objeto mais próximo
      const rawCidade = props.city || props.county || props.name || '';
      const cidade = rawCidade.trim();
      const estado = _stateToCode(props.state || '') || (props.state || '').slice(0, 2).toUpperCase();
      if (cidade && !_isStateName(cidade)) return { cidade, estado };
    }
  } catch(e) { /* continua */ }

  // 3. Nominatim — último recurso
  try {
    const r = await httpGetTimed(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`,
      { 'User-Agent': 'GS360-Solar-Monitor/1.0' }, 8000
    );
    const a = r.address || {};
    const cidade = a.city || a.town || a.municipality || a.village || a.county || '';
    const raw    = a['ISO3166-2-lvl4'] || a.state_code || '';
    const estado = (raw.includes('-') ? raw.split('-').pop() : raw.slice(0, 2)).toUpperCase()
                 || _stateToCode(a.state || '');
    if (cidade) return { cidade, estado };
  } catch(e) { /* falhou */ }

  return { cidade: '', estado: '' };
}

// ══════════════════════════════════════════════════════════
// FUNÇÕES DE REFRESH EM LOTE (status real de cada planta)
// ══════════════════════════════════════════════════════════

// Solis: usa userStationList (único endpoint que retorna status por planta)
// Retorna: { [platId]: { statusApi, geracaoHoje, geracaoMes, potenciaAtual } }
async function refreshAllSolis(api) {
  const base = 'https://www.soliscloud.com:13333';
  const path = '/v1/api/userStationList';
  const PAGE_SIZE = 20;

  async function fetchPage(pageNo) {
    const bodyObj = { pageNo, pageSize: PAGE_SIZE };
    const bodyStr = JSON.stringify(bodyObj);
    const contentMd5 = crypto.createHash('md5').update(bodyStr).digest('base64');
    const date = new Date().toUTCString();
    const stringToSign = `POST\n${contentMd5}\napplication/json\n${date}\n${path}`;
    const hmac = crypto.createHmac('sha1', api.secret).update(stringToSign).digest('base64');
    const r = await httpPost(`${base}${path}`, bodyObj, {
      'Content-MD5': contentMd5, 'Date': date, 'Authorization': `API ${api.id}:${hmac}`
    });
    if (!r || r.code !== '0') throw new Error(`Solis userStationList erro: ${r?.msg||JSON.stringify(r).slice(0,200)}`);
    return r.data?.page || r.data || {};
  }

  const first = await fetchPage(1);
  const total = parseInt(first.total || first.count || 0);
  const records = [...(first.records || [])];

  if (total > PAGE_SIZE) {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const extra = [];
    for (let p = 2; p <= totalPages; p++) extra.push(fetchPage(p));
    (await Promise.all(extra)).forEach(pg => { if (pg.records) records.push(...pg.records); });
  }

  const result = {};
  records.forEach(s => {
    const id = String(s.id || s.stationId || '');
    if (!id) return;

    // 1. Tentativa direta: campos de status conhecidos da API Solis
    //    stationStatus (v2) ou status (v1): 0=offline, 1=normal, 2=alarm
    const rawStatus = s.stationStatus !== undefined ? s.stationStatus
                    : s.status        !== undefined ? s.status
                    : s.collectionStatus !== undefined ? s.collectionStatus
                    : null;

    let statusApi;
    if (rawStatus !== null) {
      // Solis: 1=normal, 2=alarm, outros (0,3,4…)=offline — usar whitelist
      const st = parseInt(rawStatus);
      if      (st === 1) statusApi = 'online';
      else if (st === 2) statusApi = 'alerta';
      else               statusApi = 'offline';
    } else {
      // Heurística quando a API não retorna campo de status:
      //   power > 0 → gerando agora → online
      //   power = 0 → offline (dayEnergy>0 não garante online: planta pode ter falhado após gerar)
      const power = parseFloat(s.power || 0);
      statusApi = power > 0 ? 'online' : 'offline';
    }

    result[id] = {
      geracaoHoje:   parseFloat(s.dayEnergy    || 0),
      geracaoMes:    parseFloat(s.monthEnergy  || 0),
      geracaoTotal:  parseFloat(s.allEnergy    || 0),
      potenciaAtual: parseFloat(s.power        || 0),
      statusApi,
      // Campos geo/info (preenchimento automático)
      _nome:   s.stationName || s.name || '',
      _cidade: textVal(s.cityStr) || textVal(s.cityName) || textVal(s.city) || '',
      _estado: textVal(s.provinceStr) || textVal(s.provinceName) || textVal(s.province) || textVal(s.state) || '',
      _lat:    parseFloat(s.latitude || 0) || null,
      _lng:    parseFloat(s.longitude || 0) || null,
      _kwp:    parseFloat(s.installedCapacity || s.capacity || 0) || null,
    };
  });
  return result;
}

// Solarman: usa station/v1.0/list (inclui status por planta)
async function refreshAllSolarman(api) {
  const base = 'https://globalapi.solarmanpv.com';
  const tokenRes = await httpPost(`${base}/account/v1.0/token?appId=${api.appid}&language=pt`, {
    appSecret: api.secret, email: api.email, password: api.senha
  });
  if (!tokenRes.access_token) throw new Error('Falha auth Solarman');
  const token = tokenRes.access_token;

  let page = 1; const allStations = [];
  while (true) {
    const r = await httpPost(`${base}/station/v1.0/list?language=pt`, { page, size: 100 },
      { Authorization: `Bearer ${token}`, appId: api.appid });
    const list = r.list || r.stationList || [];
    list.forEach(s => allStations.push(s));
    if (list.length < 100) break;
    if (++page > 20) break;
  }

  const result = {};
  allStations.forEach(s => {
    const id = String(s.id || s.stationId || '');
    if (!id) return;
    // status Solarman: 1=normal, 2=alarm, outros (0,3,4…)=offline
    const rawSt = s.status;
    let statusApi;
    if (rawSt != null) {
      const st = parseInt(rawSt);
      statusApi = st === 1 ? 'online' : (st === 2 ? 'alerta' : 'offline');
    } else {
      // Status ausente: heurística por potência/energia (igual ao Solis)
      const power = parseFloat(s.generatingPower || s.power || 0);
      const dayEn = parseFloat(s.generationValue || s.todayEnergy || 0);
      statusApi = (power > 0 || dayEn > 0) ? 'online' : 'offline';
    }
    result[id] = {
      geracaoHoje:   parseFloat(s.generationValue || s.todayEnergy || 0),
      geracaoMes:    parseFloat(s.monthEnergy || 0),
      geracaoTotal:  parseFloat(s.totalEnergy || 0),
      potenciaAtual: parseFloat(s.generatingPower || s.power || 0) / 1000,
      statusApi,
      // Campos geo/info (preenchimento automático)
      _nome:   s.name || s.stationName || '',
      _cidade: textVal(s.city) || textVal(s.address) || textVal(s.location) || '',
      _estado: textVal(s.state) || textVal(s.province) || '',
      _lat:    parseFloat(s.locationLat || s.latitude || 0) || null,
      _lng:    parseFloat(s.locationLng || s.longitude || 0) || null,
      _kwp:    parseFloat(s.capacity || s.installedCapacity || 0) || null,
    };
  });
  return result;
}

// ── Solarman / Sofar / Deye ──────────────────────────────
// Documentação: https://solarmanpv.github.io/solax-api-doc/
async function fetchSolarman(platId, api, brand) {
  const base = 'https://globalapi.solarmanpv.com';

  // 1. Autenticar
  const tokenRes = await httpPost(`${base}/account/v1.0/token?appId=${api.appid}&language=pt`, {
    appSecret: api.secret,
    email: api.email,
    password: api.senha
  });

  if (!tokenRes.access_token) throw new Error('Falha na autenticação Solarman: ' + JSON.stringify(tokenRes));
  const token = tokenRes.access_token;

  // 2. Buscar dados em tempo real da planta
  const dataRes = await httpPost(`${base}/station/v1.0/realTime?language=pt`, {
    stationId: parseInt(platId) || platId
  }, { Authorization: `Bearer ${token}`, appId: api.appid });

  if (!dataRes || dataRes.code !== '0') throw new Error('Erro ao buscar dados: ' + JSON.stringify(dataRes));

  const d = dataRes.stationDataItems || dataRes;
  // status Solarman: 1=normal, 2=alarm, outros (0,3,4…)=offline
  const rawSmSt = dataRes.status;
  let smStatusApi;
  if (rawSmSt != null) {
    const st = parseInt(rawSmSt);
    smStatusApi = st === 1 ? 'online' : (st === 2 ? 'alerta' : 'offline');
  } else {
    const power = parseFloat(d.generatingPower || d.power || 0);
    const dayEn = parseFloat(d.generationValue || d.todayEnergy || 0);
    smStatusApi = (power > 0 || dayEn > 0) ? 'online' : 'offline';
  }
  return {
    geracaoHoje:   parseFloat(d.generationValue    || d.todayEnergy    || 0),
    geracaoMes:    parseFloat(d.monthEnergy         || 0),
    geracaoTotal:  parseFloat(d.totalEnergy         || 0),
    potenciaAtual: parseFloat(d.generatingPower     || d.power         || 0) / 1000,
    irradiacao:    parseFloat(d.irradiation         || 0),
    co2Reduzido:   parseFloat(d.co2Reduction        || 0),
    statusApi:     smStatusApi,
    fonte: 'solarman'
  };
}

// ── Growatt ──────────────────────────────────────────────
// Documentação: https://www.showdoc.com.cn/262556420217021
async function fetchGrowatt(platId, api) {
  const base = 'https://openapi.growatt.com';

  // Auth
  const loginRes = await httpPost(`${base}/v1/user/login`, {
    account: api.user,
    password: crypto.createHash('md5').update(api.pass).digest('hex')
  });
  if (!loginRes.data || !loginRes.data.token) throw new Error('Falha no login Growatt');
  const token = loginRes.data.token;

  // Dados da planta
  const plantRes = await httpGet(`${base}/v1/plant/energy?plantId=${platId}&date=${_hoje()}&timeUnit=day`, {
    token: token
  });

  const d = (plantRes.data || {});
  // status Growatt: 0=offline, 1=online, 2=alarm
  const gwStatus = parseInt(d.status ?? 1);
  return {
    geracaoHoje:   parseFloat(d.eToday || 0),
    geracaoMes:    parseFloat(d.eMonth || 0),
    geracaoTotal:  parseFloat(d.eTotal || 0),
    potenciaAtual: parseFloat(d.power  || 0) / 1000,
    statusApi:     gwStatus === 0 ? 'offline' : (gwStatus === 2 ? 'alerta' : 'online'),
    fonte: 'growatt'
  };
}

// ── Huawei FusionSolar ───────────────────────────────────
// Documentação: https://intl.fusionsolar.huawei.com/doc
async function fetchHuawei(platId, api) {
  const domainMap = { eu5: 'eu5.fusionsolar.huawei.com', intl: 'intl.fusionsolar.huawei.com', cn: 'uni003eu.fusionsolar.huawei.com' };
  const host = domainMap[api.dom || 'intl'] || domainMap.intl;
  const base = `https://${host}/thirdData`;

  // Login
  const loginRes = await httpPost(`${base}/login`, { userName: api.user, systemCode: api.pass });
  const xsrfToken = loginRes['xsrf-token'] || loginRes.data?.['xsrf-token'];
  if (!xsrfToken) throw new Error('Falha no login Huawei: ' + JSON.stringify(loginRes));

  // Dados da estação
  const stationRes = await httpPost(`${base}/getKpiInfo`, {
    stationCodes: platId,
    collectTime: Date.now(),
    queryType: 0
  }, { 'xsrf-token': xsrfToken });

  const items = stationRes?.data?.list || [];
  const item  = items[0] || {};
  const dataMap = item.dataItemMap || {};
  // run_state Huawei: 1=disconnected/offline, 2=faulty, 3=normal
  const hwState = parseInt(item.stationStatus || dataMap.run_state || 3);

  return {
    geracaoHoje:   parseFloat(dataMap.day_power     || 0),
    geracaoMes:    parseFloat(dataMap.month_power   || 0),
    geracaoTotal:  parseFloat(dataMap.total_power   || 0),
    potenciaAtual: parseFloat(dataMap.active_power  || 0) / 1000,
    capacidade:    parseFloat(dataMap.installed_capacity || 0),
    statusApi:     hwState === 1 ? 'offline' : (hwState === 2 ? 'alerta' : 'online'),
    fonte: 'huawei'
  };
}

// ── Solis ────────────────────────────────────────────────
// Documentação: https://solis-service.solisinverters.com/guide.html
async function fetchSolis(platId, api) {
  const base = 'https://www.soliscloud.com:13333';
  const body = JSON.stringify({ id: platId, stationId: platId });
  const path = '/v1/api/stationDetail';
  const contentMd5 = crypto.createHash('md5').update(body).digest('base64');
  const date = new Date().toUTCString();
  const contentType = 'application/json';
  const stringToSign = `POST\n${contentMd5}\n${contentType}\n${date}\n${path}`;
  const hmac = crypto.createHmac('sha1', api.secret).update(stringToSign).digest('base64');
  const auth = `API ${api.id}:${hmac}`;

  const result = await httpPost(`${base}${path}`, JSON.parse(body), {
    'Content-MD5': contentMd5,
    'Date': date,
    'Authorization': auth
  });

  if (!result || result.code !== '0') throw new Error('Erro Solis: ' + JSON.stringify(result));
  const d = result.data || {};
  const rawStatus = d.stationStatus !== undefined ? d.stationStatus
                  : d.status        !== undefined ? d.status
                  : null;
  let statusApi;
  if (rawStatus !== null) {
    const st = parseInt(rawStatus);
    statusApi = st === 1 ? 'online' : (st === 2 ? 'alerta' : 'offline');
  } else {
    const power = parseFloat(d.power || 0);
    statusApi = power > 0 ? 'online' : 'offline';
  }
  return {
    geracaoHoje:   parseFloat(d.dayEnergy     || 0),
    geracaoMes:    parseFloat(d.monthEnergy   || 0),
    geracaoTotal:  parseFloat(d.allEnergy     || 0),
    potenciaAtual: parseFloat(d.power         || 0),
    statusApi,
    fonte: 'solis'
  };
}

// ── Solplanet (AISWEI) — eu-api-genergal.aisweicloud.com ─
// Auth: HMAC-SHA256 assinatura em cada requisição (sem login separado)
function _spSign(method, pathWithQuery, appKey, appSecret) {
  const accept = 'application/json';
  const ct     = 'application/json; charset=UTF-8';
  const str    = `${method}\n${accept}\n\n${ct}\n\nX-Ca-Key:${appKey}\n${pathWithQuery}`;
  return crypto.createHmac('sha256', appSecret).update(str).digest('base64');
}

function _spHeaders(method, pathWithQuery, appKey, appSecret) {
  return {
    'User-Agent':              'app 1.0',
    'Content-Type':            'application/json; charset=UTF-8',
    'Accept':                  'application/json',
    'X-Ca-Signature-Headers':  'X-Ca-Key',
    'X-Ca-Key':                appKey,
    'X-Ca-Signature':          _spSign(method, pathWithQuery, appKey, appSecret)
  };
}

async function fetchSolplanet(platId, api) {
  const base = 'https://eu-api-genergal.aisweicloud.com';
  const path = `/pro/getPlantOverviewPro?apikey=${api.apikey}&token=${api.token}&isnos=${platId}`;
  console.log('[SP-fetch]', path.slice(0, 70));
  const r = await httpGet(base + path, _spHeaders('GET', path, api.appkey, api.appsecret));
  console.log('[SP-fetch-raw]', JSON.stringify(r).slice(0, 300));
  const d = r?.data || r || {};
  return {
    geracaoHoje:   parseFloat(d.eToday  || d.todayEnergy   || d.dayEnergy  || d.e_today  || 0),
    geracaoMes:    parseFloat(d.eMonth  || d.monthEnergy   || d.eMonth     || d.e_month  || 0),
    geracaoTotal:  parseFloat(d.eTotal  || d.totalEnergy   || d.eTotal     || d.e_total  || 0),
    potenciaAtual: parseFloat(d.pac     || d.power         || d.currentPower || d.p_ac   || 0) / 1000,
    fonte: 'solplanet'
  };
}

// ── Fronius SolarWeb ─────────────────────────────────────
// Documentação: https://www.fronius.com/en/photovoltaics/products/commercial/software/solarweb
async function fetchFronius(platId, api) {
  const base = 'https://api.solarweb.com/swqapi';
  const headers = { 'AccessKeyId': api.keyid, 'AccessKeyValue': api.keyval, 'Content-Type': 'application/json' };

  const dataRes = await httpGet(`${base}/pvsystems/${platId}/aggsdata/currentday`, headers);
  const channels = dataRes?.Data?.Channels || {};
  const energy   = Object.values(channels).find(c => c.ChannelName === 'EnergyProductionTotal');
  const power    = Object.values(channels).find(c => c.ChannelName === 'PowerProductionTotal');

  return {
    geracaoHoje:   energy ? parseFloat((Object.values(energy.Values || {})[0]) || 0) / 1000 : 0,
    potenciaAtual: power  ? parseFloat((Object.values(power.Values  || {})[0]) || 0) / 1000 : 0,
    fonte: 'fronius'
  };
}

// ── Auxsol ───────────────────────────────────────────────
async function fetchAuxsol(platId, api) {
  // Auxsol usa plataforma própria — ajuste o endpoint conforme documentação recebida
  const base = 'https://monitoramento.auxsol.com.br/api';

  const loginRes = await httpPost(`${base}/auth/login`, { email: api.user, password: api.pass });
  if (!loginRes.token) throw new Error('Falha no login Auxsol');
  const token = loginRes.token;

  const dataRes = await httpGet(`${base}/plants/${platId}/realtime`, { Authorization: `Bearer ${token}` });
  const d = dataRes?.data || dataRes || {};
  return {
    geracaoHoje:   parseFloat(d.energy_today    || d.geracaoHoje    || 0),
    geracaoMes:    parseFloat(d.energy_month    || d.geracaoMes     || 0),
    geracaoTotal:  parseFloat(d.energy_total    || d.geracaoTotal   || 0),
    potenciaAtual: parseFloat(d.current_power   || d.potenciaAtual  || 0) / 1000,
    fonte: 'auxsol'
  };
}

// ── Sungrow iSolarCloud ──────────────────────────────────
// Documentação: https://augateway.isolarcloud.com
async function fetchSungrow(platId, api) {
  const base = 'https://augateway.isolarcloud.com';
  const loginRes = await httpPost(`${base}/v1/userService/login`, {
    appkey: api.appkey,
    user_account: api.user,
    user_password: api.pass,
    org_id: '',
    msg_datetime: new Date().toISOString().replace(/[TZ.-]/g, '').slice(0, 14)
  });
  if (!loginRes.result_data?.token) throw new Error('Falha no login Sungrow: ' + JSON.stringify(loginRes));
  const token = loginRes.result_data.token;

  const dataRes = await httpPost(`${base}/v1/powerStationService/queryDeviceList`, {
    appkey: api.appkey, token: token, ps_id: platId
  });
  const d = (dataRes.result_data || [])[0] || {};
  return {
    geracaoHoje:   parseFloat(d.today_energy || 0),
    geracaoMes:    parseFloat(d.month_energy || 0),
    geracaoTotal:  parseFloat(d.total_energy || 0),
    potenciaAtual: parseFloat(d.curr_power   || 0) / 1000,
    fonte: 'sungrow'
  };
}

// ── Hoymiles S-Miles Cloud ───────────────────────────────
// Documentação: https://global.hoymiles.com/platform/api/gateway
async function fetchHoymiles(platId, api) {
  const base = 'https://global.hoymiles.com/platform/api/gateway';
  const loginRes = await httpPost(`${base}/iam/auth_login`, {
    body: { user_name: api.user, password: crypto.createHash('md5').update(api.pass).digest('hex') }
  });
  const token = loginRes.data?.token;
  if (!token) throw new Error('Falha no login Hoymiles');

  const dataRes = await httpPost(`${base}/pvm-data/api/0/station/real`, {
    body: { sid: platId }
  }, { Cookie: `hm_token_locale=${token}` });
  const d = dataRes.data || {};
  return {
    geracaoHoje:   parseFloat(d.today_eq  || 0),
    geracaoMes:    parseFloat(d.month_eq  || 0),
    geracaoTotal:  parseFloat(d.total_eq  || 0),
    potenciaAtual: parseFloat(d.real_power || 0),
    fonte: 'hoymiles'
  };
}

// ── GoodWe SEMS ──────────────────────────────────────────
// Documentação: https://www.semsportal.com/Swagger
async function fetchGoodwe(platId, api) {
  const base = 'https://www.semsportal.com/api';
  const loginRes = await httpPost(`${base}/v2/Common/CrossLogin`, {
    account: api.email,
    pwd: api.pass,
    is_local: false,
    lang: '_pt'
  }, { Token: JSON.stringify({ timestamp: '', uid: '', token: '', client: 'web', version: '', company_id: '' }) });

  const data = loginRes.data;
  if (!data?.token) throw new Error('Falha no login GoodWe');
  const authToken = JSON.stringify({ timestamp: data.timestamp, uid: data.uid, token: data.token, client: 'web', version: '', company_id: '' });

  const stationRes = await httpPost(`${base}/v3/PowerStation/GetMonitorDetailByPowerstationId`, {
    powerStationId: platId
  }, { Token: authToken });
  const d = stationRes.data?.kpi || {};
  return {
    geracaoHoje:   parseFloat(d.power          || 0),
    geracaoMes:    parseFloat(d.month_generation|| 0),
    geracaoTotal:  parseFloat(d.total_power     || 0),
    potenciaAtual: parseFloat(d.pac             || 0) / 1000,
    fonte: 'goodwe'
  };
}

// ── SMA Sunny Portal (Ennexos) ───────────────────────────
// Documentação: https://ennexos.sunnyportal.com/xom/api
async function fetchSma(platId, api) {
  const base = 'https://ennexos.sunnyportal.com/xom/api/v1';
  const tokenRes = await httpPost(`${base}/token`, `grant_type=client_credentials&client_id=${encodeURIComponent(api.clientid)}&client_secret=${encodeURIComponent(api.secret)}`, {
    'Content-Type': 'application/x-www-form-urlencoded'
  });
  if (!tokenRes.access_token) throw new Error('Falha na autenticação SMA');
  const token = tokenRes.access_token;

  const dataRes = await httpGet(`${base}/systems/${platId}/measurements/live`, { Authorization: `Bearer ${token}` });
  const ch = (dataRes.measurements || []);
  const findVal = (type) => { const c = ch.find(m => m.channelId === type); return c ? parseFloat(c.values?.[0]?.value || 0) : 0; };
  return {
    geracaoHoje:   findVal('DayEnergy') / 1000,
    geracaoTotal:  findVal('TotalEnergy') / 1000,
    potenciaAtual: findVal('PVPower') / 1000,
    fonte: 'sma'
  };
}

// ── FoxESS Cloud ─────────────────────────────────────────
// Documentação: https://www.foxesscloud.com/public/i18n/en/OpenApiInfomation.html
async function fetchFoxess(platId, api) {
  const base = 'https://www.foxesscloud.com/op/v0';
  const ts = Date.now().toString();
  const signature = crypto.createHash('md5').update(`${api.apikey}\\n${ts}`).digest('hex');

  const headers = { 'token': api.apikey, 'timestamp': ts, 'signature': signature, 'lang': 'pt' };
  const dataRes = await httpPost(`${base}/device/real/queryPower`, { sn: platId, variables: ['pvPower','generationPower','energyToday','energyTotal','monthEnergy'] }, headers);
  const d = dataRes.result || {};
  const find = (k) => (d.datas || []).find(x => x.variable === k)?.value || 0;
  return {
    geracaoHoje:   parseFloat(find('energyToday')),
    geracaoMes:    parseFloat(find('monthEnergy')),
    geracaoTotal:  parseFloat(find('energyTotal')),
    potenciaAtual: parseFloat(find('generationPower')) / 1000,
    fonte: 'foxess'
  };
}

// ── SAJ eSolar ───────────────────────────────────────────
// Documentação: https://fop.saj-electric.com/api
async function fetchSaj(platId, api) {
  const base = 'https://fop.saj-electric.com/saj/login';
  const ts = Date.now();
  const nonce = crypto.randomBytes(8).toString('hex');
  const sign = crypto.createHmac('sha1', api.secret).update(`${api.appid}${ts}${nonce}`).digest('hex');

  const loginRes = await httpPost(base, {}, {
    appid: api.appid, timestamp: ts, nonce: nonce, sign: sign, 'Content-Type': 'application/x-www-form-urlencoded'
  });
  if (!loginRes.obj?.token) throw new Error('Falha no login SAJ');
  const token = loginRes.obj.token;

  const dataRes = await httpPost('https://fop.saj-electric.com/saj/monitor/site/getSiteRealTimeData', {
    plantuid: platId
  }, { Authorization: token });
  const d = dataRes.obj || {};
  return {
    geracaoHoje:   parseFloat(d.todayElectricity  || 0),
    geracaoMes:    parseFloat(d.monthElectricity  || 0),
    geracaoTotal:  parseFloat(d.totalElectricity  || 0),
    potenciaAtual: parseFloat(d.nowPower          || 0) / 1000,
    fonte: 'saj'
  };
}

// ══════════════════════════════════════════════════════════
// FUNÇÕES DE LISTAGEM (action: 'list')
// ══════════════════════════════════════════════════════════

function _mapPlant(id, nome, potencia, endereco, lat, lng) {
  return { id: String(id||''), nome: String(nome||'Sem nome'), potencia: parseFloat(potencia||0)||0, endereco: String(endereco||''), lat: lat||null, lng: lng||null };
}

// ── Solarman list ────────────────────────────────────────
async function listSolarman(api) {
  const base = 'https://globalapi.solarmanpv.com';
  const tokenRes = await httpPost(`${base}/account/v1.0/token?appId=${api.appid}&language=pt`, {
    appSecret: api.secret, email: api.email, password: api.senha
  });
  if (!tokenRes.access_token) throw new Error('Falha auth Solarman');
  const token = tokenRes.access_token;

  // Busca paginada — 100 por página
  let page = 1; const allStations = [];
  while (true) {
    const r = await httpPost(`${base}/station/v1.0/list?language=pt`, { page, size: 100 },
      { Authorization: `Bearer ${token}`, appId: api.appid });
    const list = r.list || r.stationList || [];
    list.forEach(s => allStations.push(s));
    if (list.length < 100) break;
    page++;
    if (page > 20) break; // segurança: máx 2000 plantas
  }
  return allStations.map(s =>
    _mapPlant(s.id||s.stationId, s.name||s.stationName, s.installedCapacity, [s.city,s.province].filter(Boolean).join(', '), s.lat, s.lng));
}

// ── Growatt list ─────────────────────────────────────────
async function listGrowatt(api) {
  const base = 'https://openapi.growatt.com';
  const loginRes = await httpPost(`${base}/v1/user/login`, {
    account: api.user, password: crypto.createHash('md5').update(api.pass).digest('hex')
  });
  if (!loginRes.data?.token) throw new Error('Falha auth Growatt');
  const r = await httpGet(`${base}/v1/plant/list?page=1&perPage=100`, { token: loginRes.data.token });
  return ((r.data||{}).plants||[]).map(p =>
    _mapPlant(p.plant_id, p.plant_name, p.peak_power_actual||p.nominal_power, [p.city,p.country].filter(Boolean).join(', ')));
}

// ── Huawei list ──────────────────────────────────────────
async function listHuawei(api) {
  const domainMap = { eu5:'eu5.fusionsolar.huawei.com', intl:'intl.fusionsolar.huawei.com', cn:'uni003eu.fusionsolar.huawei.com' };
  const host = domainMap[api.dom||'intl']||domainMap.intl;
  const base = `https://${host}/thirdData`;
  const loginRes = await httpPost(`${base}/login`, { userName: api.user, systemCode: api.pass });
  const xsrf = loginRes['xsrf-token'] || loginRes.data?.['xsrf-token'];
  if (!xsrf) throw new Error('Falha auth Huawei');
  const r = await httpPost(`${base}/getStationList`, { pageNo: 1, pageSize: 100 }, { 'xsrf-token': xsrf });
  return ((r?.data?.list)||[]).map(s =>
    _mapPlant(s.dn||s.stationCode, s.name||s.stationName, s.capacity||s.installedCapacity, s.address));
}

// ── Solis list (paginado) ────────────────────────────────
async function listSolis(api) {
  const base = 'https://www.soliscloud.com:13333';
  const path = '/v1/api/userStationList';
  const PAGE_SIZE = 20; // Solis limita a 20 por página

  async function fetchPage(pageNo) {
    const bodyObj = { pageNo, pageSize: PAGE_SIZE };
    const bodyStr = JSON.stringify(bodyObj);
    const contentMd5 = crypto.createHash('md5').update(bodyStr).digest('base64');
    const date = new Date().toUTCString();
    const stringToSign = `POST\n${contentMd5}\napplication/json\n${date}\n${path}`;
    const hmac = crypto.createHmac('sha1', api.secret).update(stringToSign).digest('base64');
    const r = await httpPost(`${base}${path}`, bodyObj, {
      'Content-MD5': contentMd5, 'Date': date, 'Authorization': `API ${api.id}:${hmac}`
    });
    if (!r || r.code !== '0') {
      throw new Error(`Solis API erro ${r?.code||'?'}: ${r?.msg||r?.message||JSON.stringify(r).slice(0,200)}`);
    }
    return r.data?.page || r.data || {};
  }

  // Busca página 1 e descobre o total
  const first = await fetchPage(1);
  const total = parseInt(first.total || first.count || 0);
  const records = first.records || [];

  // Busca páginas restantes em paralelo
  if (total > PAGE_SIZE) {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const extraPages = [];
    for (let p = 2; p <= totalPages; p++) extraPages.push(fetchPage(p));
    const extras = await Promise.all(extraPages);
    extras.forEach(pg => { if (pg.records) records.push(...pg.records); });
  }

  return records.map(s =>
    _mapPlant(s.id, s.stationName||s.name, s.installedCapacity||s.capacity,
      [s.city, s.province||s.state].filter(Boolean).join(', '), s.latitude, s.longitude));
}

// ── Solplanet list ───────────────────────────────────────
async function listSolplanet(api) {
  const base = 'https://eu-api-genergal.aisweicloud.com';
  const path = `/pro/getPlanListPro?apikey=${api.apikey}&token=${api.token}`;
  console.log('[SP-list] GET', path.slice(0, 80));
  const r = await httpGet(base + path, _spHeaders('GET', path, api.appkey, api.appsecret));
  console.log('[SP-list-raw]', JSON.stringify(r).slice(0, 400));

  const plants = r?.data?.list
              || r?.data?.records
              || r?.data?.plants
              || (Array.isArray(r?.data) ? r.data : null)
              || r?.list || r?.records
              || (Array.isArray(r) ? r : []);

  console.log('[SP-list-count]', plants.length);
  return plants.map(p => _mapPlant(
    p.sn         || p.isnos     || p.plantId   || p.id,
    p.name       || p.plantName || p.stationName,
    p.capacity   || p.kwp       || p.installedCapacity,
    p.address    || p.location  || [p.city, p.province].filter(Boolean).join(', ')
  ));
}

// ── FoxESS list ──────────────────────────────────────────
async function listFoxess(api) {
  const base = 'https://www.foxesscloud.com/op/v0';
  const ts = Date.now().toString();
  const sig = crypto.createHash('md5').update(`${api.apikey}\\n${ts}`).digest('hex');
  const r = await httpPost(`${base}/plant/list`, { currentPage: 1, pageSize: 100 },
    { token: api.apikey, timestamp: ts, signature: sig, lang: 'pt' });
  return ((r.result?.data)||[]).map(p =>
    _mapPlant(p.plantID||p.id, p.name, p.capacity, p.country));
}

// ── GoodWe list ──────────────────────────────────────────
async function listGoodwe(api) {
  const base = 'https://www.semsportal.com/api';
  const emptyToken = JSON.stringify({ timestamp:'', uid:'', token:'', client:'web', version:'', company_id:'' });
  const loginRes = await httpPost(`${base}/v2/Common/CrossLogin`,
    { account: api.email, pwd: api.pass, is_local: false, lang: '_pt' }, { Token: emptyToken });
  const d = loginRes.data;
  if (!d?.token) throw new Error('Falha auth GoodWe');
  const authToken = JSON.stringify({ timestamp: d.timestamp, uid: d.uid, token: d.token, client: 'web', version: '', company_id: '' });
  const r = await httpPost(`${base}/v3/PowerStation/GetMonitorInfo`,
    { page_index: 1, page_size: 100 }, { Token: authToken });
  return ((r.data?.list)||[]).map(p =>
    _mapPlant(p.id||p.stationId, p.name||p.stationName, p.capacity||p.powerstation_capacity, [p.city,p.country].filter(Boolean).join(', ')));
}

// ── SAJ list ─────────────────────────────────────────────
async function listSaj(api) {
  const ts = Date.now();
  const nonce = crypto.randomBytes(8).toString('hex');
  const sign = crypto.createHmac('sha1', api.secret).update(`${api.appid}${ts}${nonce}`).digest('hex');
  const loginRes = await httpPost('https://fop.saj-electric.com/saj/login', {},
    { appid: api.appid, timestamp: ts, nonce, sign, 'Content-Type': 'application/x-www-form-urlencoded' });
  if (!loginRes.obj?.token) throw new Error('Falha auth SAJ');
  const r = await httpPost('https://fop.saj-electric.com/saj/monitor/site/getSiteList',
    { pageNo: 1, pageSize: 100 }, { Authorization: loginRes.obj.token });
  return ((r.obj?.records||r.obj)||[]).map(p =>
    _mapPlant(p.plantuid||p.id, p.name, p.designCapacity||p.capacity, p.address));
}

// ── Sungrow list ─────────────────────────────────────────
async function listSungrow(api) {
  const base = 'https://augateway.isolarcloud.com';
  const loginRes = await httpPost(`${base}/v1/userService/login`, {
    appkey: api.appkey, user_account: api.user, user_password: api.pass, org_id: '',
    msg_datetime: new Date().toISOString().replace(/[TZ.-]/g,'').slice(0,14)
  });
  if (!loginRes.result_data?.token) throw new Error('Falha auth Sungrow');
  const r = await httpPost(`${base}/v1/powerStationService/getPowerStationList`,
    { appkey: api.appkey, token: loginRes.result_data.token, page_size: 100, cur_page: 1 });
  return (r.result_data?.pageList||[]).map(p =>
    _mapPlant(p.ps_id, p.ps_name, p.design_capacity||p.capacity, [p.city,p.country].filter(Boolean).join(', '), p.latitude, p.longitude));
}

// ── fetch_info: Solis — detalhe da usina + lista inversores ─
async function fetchInfoSolis(platId, api) {
  const base = 'https://www.soliscloud.com:13333';

  function solisSign(path, bodyObj) {
    const bodyStr = JSON.stringify(bodyObj);
    const md5  = crypto.createHash('md5').update(bodyStr).digest('base64');
    const date = new Date().toUTCString();
    const sig  = crypto.createHmac('sha1', api.secret)
                       .update(`POST\n${md5}\napplication/json\n${date}\n${path}`)
                       .digest('base64');
    return { md5, date, auth: `API ${api.id}:${sig}` };
  }

  async function solisPost(path, bodyObj) {
    const { md5, date, auth } = solisSign(path, bodyObj);
    return httpPost(`${base}${path}`, bodyObj, { 'Content-MD5': md5, 'Date': date, 'Authorization': auth });
  }

  // Busca sequencial com parada antecipada — evita chamadas paralelas que causam rate-limit
  const PAGE_SIZE = 20;
  let station = null;
  let page = 1;
  while (!station) {
    const r = await solisPost('/v1/api/userStationList', { pageNo: page, pageSize: PAGE_SIZE });
    if (!r || r.code !== '0') throw new Error(`Solis list p${page}: ${r?.msg || r?.code || JSON.stringify(r).slice(0,80)}`);
    const pg   = r.data?.page || r.data || {};
    const recs = pg.records || [];
    station = recs.find(s => String(s.id || s.stationId || '') === String(platId)) || null;
    const total = parseInt(pg.total || pg.count || 0);
    if (station || recs.length < PAGE_SIZE || page * PAGE_SIZE >= total) break;
    page++;
  }
  const s = station || {};

  // Lista de inversores
  const invR = await solisPost('/v1/api/inverterList', { stationId: platId, pageNo: 1, pageSize: 20 });
  const invRecs = invR.data?.page?.records || invR.data?.records || [];
  const inversores = invRecs.map(i => ({
    sn: i.sn || i.inverterSn || '', modelo: i.invertType || i.inverterType || i.model || ''
  })).filter(i => i.sn);

  const lat = parseFloat(s.latitude  || s.lat || 0) || null;
  const lng = parseFloat(s.longitude || s.lng || 0) || null;
  let cidade = textVal(s.cityStr) || textVal(s.cityName) || textVal(s.city) || '';
  let estado = textVal(s.provinceStr) || textVal(s.provinceName) || textVal(s.province) || textVal(s.state) || '';

  // Solis retorna IDs numéricos p/ cidade — usa reverse geocoding se campos de texto estiverem vazios
  if (!cidade && lat && lng) {
    const geo = await reverseGeocode(lat, lng);
    cidade = geo.cidade;
    if (!estado) estado = geo.estado;
  }

  return {
    nome: s.stationName || s.name || '',
    cidade, estado, lat, lng,
    kwp:  parseFloat(s.installedCapacity || s.capacity || s.power || 0) || null,
    inversores
  };
}

// ── fetch_info: Solarman — detalhe da usina + lista inversores ─
async function fetchInfoSolarman(platId, api) {
  const base = 'https://globalapi.solarmanpv.com';

  // 1. Autenticar (mesmo padrão de refreshAllSolarman)
  const tokenRes = await httpPost(`${base}/account/v1.0/token?appId=${api.appid}&language=pt`, {
    appSecret: api.secret, email: api.email, password: api.senha
  });
  if (!tokenRes.access_token) throw new Error('Falha auth Solarman');
  const token = tokenRes.access_token;
  const hdr = { Authorization: `Bearer ${token}`, appId: api.appid };

  // 2. Localizar a usina via station/v1.0/list (retorna cidade/lat/lng; mesmo padrão de refreshAllSolarman)
  let page = 1;
  let station = null;
  outer: while (page <= 20) {
    const r = await httpPost(`${base}/station/v1.0/list?language=pt`, { page, size: 100 }, hdr);
    const list = r.list || r.stationList || [];
    for (const s of list) {
      if (String(s.id || s.stationId || '') === String(platId)) { station = s; break outer; }
    }
    if (list.length < 100) break;
    page++;
  }
  const d = station || {};

  // 3. Lista de dispositivos (inversores têm deviceSn preenchido; filtra deviceType===1 se disponível)
  const sid = parseInt(platId) || platId;
  const devRes = await httpPost(`${base}/device/v1.0/list?language=pt`, { stationId: sid, page: 1, size: 20 }, hdr);
  const allDevices = devRes.deviceListItems || devRes.list || devRes.data || [];
  const devices = allDevices.filter(x =>
    (x.deviceType === 1 || x.collectionType === 1 || allDevices.every(y => y.deviceType == null)) && (x.deviceSn || x.sn)
  );
  const inversores = devices.map(x => ({
    sn:     x.deviceSn    || x.sn    || '',
    modelo: x.productName || x.model || ''
  })).filter(i => i.sn);

  const lat = parseFloat(d.locationLat || d.latitude  || 0) || null;
  const lng = parseFloat(d.locationLng || d.longitude || 0) || null;
  let cidade = textVal(d.city) || textVal(d.address) || textVal(d.location) || '';
  let estado = textVal(d.state) || textVal(d.locationState) || textVal(d.provinceOrState) || '';

  if (!cidade && lat && lng) {
    const geo = await reverseGeocode(lat, lng);
    cidade = geo.cidade;
    if (!estado) estado = geo.estado;
  }

  return {
    nome: d.name || d.stationName || '',
    cidade, estado, lat, lng,
    kwp:  parseFloat(d.capacity || d.installedCapacity || 0) || null,
    inversores
  };
}

// ── fetch_sn: Solis — lista inversores da usina (SN rápido) ─
async function fetchSnSolis(platId, api) {
  const base = 'https://www.soliscloud.com:13333';
  const path = '/v1/api/inverterList';
  const bodyObj = { stationId: platId, pageNo: 1, pageSize: 20 };
  const bodyStr = JSON.stringify(bodyObj);
  const md5  = crypto.createHash('md5').update(bodyStr).digest('base64');
  const date = new Date().toUTCString();
  const sig  = crypto.createHmac('sha1', api.secret)
                     .update(`POST\n${md5}\napplication/json\n${date}\n${path}`)
                     .digest('base64');
  const r = await httpPost(`${base}${path}`, bodyObj, {
    'Content-MD5': md5, 'Date': date, 'Authorization': `API ${api.id}:${sig}`
  });
  const recs = r.data?.page?.records || r.data?.records || r.data || [];
  const inversores = (Array.isArray(recs) ? recs : []).map(i => ({
    sn: i.sn || i.inverterSn || '', modelo: i.invertType || i.inverterType || i.model || ''
  })).filter(i => i.sn);
  return { inversores };
}

// ── fetch_sn: Solarman — lista inversores da usina (SN rápido) ─
async function fetchSnSolarman(platId, api) {
  const base = 'https://globalapi.solarmanpv.com';
  const tokenRes = await httpPost(`${base}/account/v1.0/token?appId=${api.appid}&language=pt`, {
    appSecret: api.secret, email: api.email, password: api.senha
  });
  if (!tokenRes.access_token) throw new Error('Falha auth Solarman');
  const token = tokenRes.access_token;
  const hdr = { Authorization: `Bearer ${token}`, appId: api.appid };
  const sid = parseInt(platId) || platId;
  const devRes = await httpPost(`${base}/device/v1.0/list?language=pt`, { stationId: sid, page: 1, size: 20 }, hdr);
  const all = devRes.deviceListItems || devRes.list || devRes.data || [];
  const inversores = (Array.isArray(all) ? all : [])
    .filter(x => x.deviceSn || x.sn)
    .map(x => ({ sn: x.deviceSn || x.sn || '', modelo: x.productName || x.model || '' }))
    .filter(i => i.sn);
  return { inversores };
}

// ── Helpers ──────────────────────────────────────────────
function _hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
