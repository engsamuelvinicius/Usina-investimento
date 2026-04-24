const admin = require('./_firebase');
const autenticar = require('./_auth');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const uid = await autenticar(req);
    const { id } = req.query;
    if (!id) return res.status(400).json({ erro: 'ID obrigatório' });

    const snap = await admin.firestore().collection('integradores').doc(uid).get();
    const cfg = snap.data() || {};
    if (!cfg.asaasKey) return res.status(400).json({ erro: 'Chave Asaas não configurada' });

    const base = cfg.asaasSandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/api/v3';

    const resp = await fetch(`${base}/payments/${id}`, {
      headers: { access_token: cfg.asaasKey },
    });
    const json = await resp.json();

    res.json({ id: json.id, status: json.status, valor: json.value, vencimento: json.dueDate });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
};
