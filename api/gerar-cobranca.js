const admin = require('./_firebase');
const autenticar = require('./_auth');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const uid = await autenticar(req);
    const { clienteAsaasId, valor, vencimento, descricao, usinaId, clienteId, mes } = req.body;

    if (!clienteAsaasId || !valor || !vencimento) {
      return res.status(400).json({ erro: 'Dados incompletos' });
    }

    const snap = await admin.firestore().collection('integradores').doc(uid).get();
    const cfg = snap.data() || {};
    if (!cfg.asaasKey) return res.status(400).json({ erro: 'Chave Asaas não configurada' });

    const base = cfg.asaasSandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/api/v3';

    const headers = { 'Content-Type': 'application/json', access_token: cfg.asaasKey };

    const resp = await fetch(`${base}/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customer: clienteAsaasId,
        billingType: 'PIX',
        value: valor,
        dueDate: vencimento,
        description: descricao || 'Energia solar',
        externalReference: JSON.stringify({ uid, usinaId, clienteId, mes }),
      }),
    });
    const json = await resp.json();
    if (!json.id) return res.status(400).json({ erro: json.errors?.[0]?.description || 'Erro ao gerar cobrança' });

    // Get PIX QR Code
    const pixResp = await fetch(`${base}/payments/${json.id}/pixQrCode`, { headers });
    const pixJson = await pixResp.json();

    res.json({
      id: json.id,
      valor: json.value,
      status: json.status,
      vencimento: json.dueDate,
      invoiceUrl: json.invoiceUrl || '',
      pixQrCode: pixJson.encodedImage || '',
      pixCopiaECola: pixJson.payload || '',
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
};
