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

  const { brand, platId, api } = req.body || {};
  if (!brand || !platId) return res.status(400).json({ error: 'brand e platId são obrigatórios' });
  if (!api || typeof api !== 'object') return res.status(400).json({ error: 'Credenciais (api) ausentes' });

  try {
    let data;
    switch (brand) {
      case 'solarman': data = await fetchSolarman(platId, api); break;
      case 'growatt':  data = await fetchGrowatt(platId, api);  break;
      case 'huawei':   data = await fetchHuawei(platId, api);   break;
      case 'solis':    data = await fetchSolis(platId, api);    break;
      case 'sofar':    data = await fetchSolarman(platId, api, 'sofar'); break; // Sofar usa Solarman API
      case 'deye':     data = await fetchSolarman(platId, api, 'deye');  break; // Deye usa Solarman API
      case 'solplanet':data = await fetchSolplanet(platId, api);break;
      case 'fronius':  data = await fetchFronius(platId, api);  break;
      case 'auxsol':   data = await fetchAuxsol(platId, api);   break;
      default: return res.status(400).json({ error: 'Marca não suportada: ' + brand });
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
  return {
    geracaoHoje:   parseFloat(d.generationValue    || d.todayEnergy    || 0),
    geracaoMes:    parseFloat(d.monthEnergy         || 0),
    geracaoTotal:  parseFloat(d.totalEnergy         || 0),
    potenciaAtual: parseFloat(d.generatingPower     || d.power         || 0) / 1000, // W → kW
    irradiacao:    parseFloat(d.irradiation         || 0),
    co2Reduzido:   parseFloat(d.co2Reduction        || 0),
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
  return {
    geracaoHoje:   parseFloat(d.eToday || 0),
    geracaoMes:    parseFloat(d.eMonth || 0),
    geracaoTotal:  parseFloat(d.eTotal || 0),
    potenciaAtual: parseFloat(d.power  || 0) / 1000,
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

  return {
    geracaoHoje:   parseFloat(dataMap.day_power     || 0),
    geracaoMes:    parseFloat(dataMap.month_power   || 0),
    geracaoTotal:  parseFloat(dataMap.total_power   || 0),
    potenciaAtual: parseFloat(dataMap.active_power  || 0) / 1000,
    capacidade:    parseFloat(dataMap.installed_capacity || 0),
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
  return {
    geracaoHoje:   parseFloat(d.dayEnergy     || 0),
    geracaoMes:    parseFloat(d.monthEnergy   || 0),
    geracaoTotal:  parseFloat(d.allEnergy     || 0),
    potenciaAtual: parseFloat(d.power         || 0),
    fonte: 'solis'
  };
}

// ── Solplanet ────────────────────────────────────────────
async function fetchSolplanet(platId, api) {
  const base = 'https://api.solplanet.net';

  const loginRes = await httpPost(`${base}/v2/user/login`, { account: api.user, password: api.pass });
  if (!loginRes.data?.token) throw new Error('Falha no login Solplanet');
  const token = loginRes.data.token;

  const dataRes = await httpGet(`${base}/v2/plant/info?plantId=${platId}`, { Authorization: `Bearer ${token}` });
  const d = dataRes?.data || {};
  return {
    geracaoHoje:   parseFloat(d.todayElectricity || 0),
    geracaoMes:    parseFloat(d.monthElectricity || 0),
    geracaoTotal:  parseFloat(d.totalElectricity || 0),
    potenciaAtual: parseFloat(d.currentPower     || 0) / 1000,
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

// ── Helpers ──────────────────────────────────────────────
function _hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
