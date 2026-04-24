const admin = require('./_firebase');
const autenticar = require('./_auth');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
}

async function getCfg(uid) {
  const snap = await admin.firestore().collection('integradores').doc(uid).get();
  return snap.data() || {};
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const uid = await autenticar(req);
    const { nome, cpfCnpj, email, fone } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });

    const cfg = await getCfg(uid);
    if (!cfg.asaasKey) return res.status(400).json({ erro: 'Chave Asaas não configurada' });

    const base = cfg.asaasSandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/api/v3';

    const headers = { 'Content-Type': 'application/json', access_token: cfg.asaasKey };

    // Check if customer already exists by email
    if (email) {
      const busca = await fetch(`${base}/customers?email=${encodeURIComponent(email)}`, { headers });
      const buscaJson = await busca.json();
      if (buscaJson.data && buscaJson.data.length > 0) {
        return res.json({ id: buscaJson.data[0].id, existente: true });
      }
    }

    const body = { name: nome };
    if (cpfCnpj) body.cpfCnpj = cpfCnpj;
    if (email) body.email = email;
    if (fone) body.mobilePhone = fone;

    const resp = await fetch(`${base}/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const json = await resp.json();

    if (json.id) return res.json({ id: json.id });
    res.status(400).json({ erro: json.errors?.[0]?.description || 'Erro ao criar cliente' });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
};
