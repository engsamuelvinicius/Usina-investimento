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

    const { imagemBase64 } = req.body;
    if (!imagemBase64) return res.status(400).json({ erro: 'Imagem não fornecida' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        erro: 'ANTHROPIC_API_KEY não configurada. Adicione nas variáveis de ambiente do Vercel.'
      });
    }

    // Detectar tipo da imagem a partir do data URL
    const mediaType = imagemBase64.startsWith('data:image/png')  ? 'image/png'
                    : imagemBase64.startsWith('data:image/webp') ? 'image/webp'
                    : imagemBase64.startsWith('data:image/gif')  ? 'image/gif'
                    : 'image/jpeg';
    const base64Data = imagemBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const prompt = `Analise este documento (pode ser RG, CPF, CNH, comprovante de residência, CNPJ ou qualquer documento do cliente) e extraia as informações abaixo.

Retorne APENAS um JSON válido, sem texto extra, sem markdown, sem explicações. Use string vazia "" para campos não encontrados:

{
  "nome": "nome completo da pessoa ou empresa",
  "cpf": "CPF no formato 000.000.000-00",
  "cnpj": "CNPJ no formato 00.000.000/0001-00",
  "rg": "número do RG",
  "nascimento": "data de nascimento no formato dd/mm/aaaa",
  "endereco": "logradouro, número e complemento (sem cidade/estado/CEP)",
  "cidade": "nome da cidade",
  "estado": "sigla do estado (ex: RN, SP, MG)",
  "cep": "CEP no formato 00000-000",
  "email": "endereço de e-mail",
  "telefone": "telefone ou celular com DDD"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const json = await response.json();
    if (!response.ok) {
      return res.status(400).json({ erro: json.error?.message || 'Erro na API Anthropic' });
    }

    const text = (json.content?.[0]?.text || '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(400).json({ erro: 'Não foi possível identificar dados no documento.' });
    }

    const dados = JSON.parse(jsonMatch[0]);
    return res.json({ ok: true, dados });

  } catch (e) {
    console.error('extrair-contrato error:', e.message);
    return res.status(500).json({ erro: e.message });
  }
};
