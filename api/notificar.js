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
    await autenticar(req);
    const { telefone, mensagem } = req.body;
    if (!telefone || !mensagem) return res.status(400).json({ erro: 'Dados inválidos' });

    const instance = process.env.ZAPI_INSTANCE;
    const token = process.env.ZAPI_TOKEN;
    const clientToken = process.env.ZAPI_CLIENT_TOKEN || '';

    if (!instance || !token) {
      return res.status(400).json({ erro: 'WhatsApp não configurado no servidor. Adicione ZAPI_INSTANCE e ZAPI_TOKEN nas variáveis de ambiente do Vercel.' });
    }

    const fone = telefone.replace(/\D/g, '');
    const resp = await fetch(
      `https://api.z-api.io/instances/${instance}/token/${token}/send-text`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': clientToken,
        },
        body: JSON.stringify({ phone: fone, message: mensagem }),
      }
    );
    const json = await resp.json();

    if (json.zaapId || json.messageId) return res.json({ ok: true });
    res.status(400).json({ erro: json.message || 'Erro ao enviar mensagem' });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
};
