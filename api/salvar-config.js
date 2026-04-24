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
    const { asaasKey, sandbox } = req.body;
    if (!asaasKey) return res.status(400).json({ erro: 'Chave inválida' });

    const base = sandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/api/v3';

    const teste = await fetch(`${base}/myAccount`, {
      headers: { access_token: asaasKey },
    });
    if (!teste.ok) return res.status(400).json({ erro: 'Chave Asaas inválida ou sem permissão' });
    const conta = await teste.json();

    await admin.firestore()
      .collection('integradores').doc(uid)
      .set({ asaasKey, asaasSandbox: !!sandbox, asaasNome: conta.name || '' }, { merge: true });

    res.json({ ok: true, nome: conta.name || '' });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
};
