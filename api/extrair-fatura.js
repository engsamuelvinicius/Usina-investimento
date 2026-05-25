function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
}

function tokenValido(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token.length > 100 && token.split('.').length === 3;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!tokenValido(req)) {
    return res.status(401).json({ erro: 'Não autenticado' });
  }

  const body = req.body || {};
  const texto = String(body.texto || '').trim();
  const tipo = String(body.tipo || 'geracao');

  if (texto.length < 30) {
    return res.status(400).json({ erro: 'Texto da conta muito curto ou ilegível' });
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({ erro: 'Serviço de IA não configurado.' });
  }

  try {
    const dica = tipo === 'consumo'
      ? 'Esta é a conta de uma unidade CONSUMIDORA / BENEFICIÁRIA de energia solar compensada.'
      : 'Esta é a conta da usina GERADORA (minigeradora/microgeradora solar). ATENÇÃO: a usina pode não ter injetado energia neste mês (ex: recém instalada). Nesse caso a conta mostrará apenas o consumo próprio da usina, sem linha de "Energia Injetada" — neste caso energiaInjetada = 0.';

    const prompt = 'Você analisa contas de energia elétrica brasileiras (CEMIG, CPFL, ENEL, Energisa, Neoenergia, COSERN, etc.).\n'
      + dica + '\n\n'
      + '!! DISTINÇÃO CRÍTICA !!\n'
      + 'energiaAtiva  = kWh que a unidade RECEBEU/CONSUMIU da distribuidora (fluxo rede → unidade).\n'
      + 'energiaInjetada = kWh que a unidade ENVIOU para a rede elétrica (fluxo unidade → rede), proveniente de geração solar. Aparece como "Energia Injetada", "Geração", "Excedente injetado". Se não houver essa linha na conta, coloque 0, NUNCA confunda com consumo.\n\n'
      + 'Extraia os campos abaixo. Para campos não encontrados use null (exceto energiaInjetada de geradora: use 0).\n'
      + 'Responda APENAS com JSON puro, sem markdown, sem texto fora do JSON.\n\n'
      + 'CAMPOS:\n'
      + '- mes: abreviacao 3 letras do mes de referencia (Jan Fev Mar Abr Mai Jun Jul Ago Set Out Nov Dez)\n'
      + '- ano: string 4 digitos, ex: "2025"\n'
      + '- uc: numero da UC / unidade consumidora como string\n'
      + '- contrato: numero do contrato ou codigo do cliente como string\n'
      + '- vencimento: data de vencimento da fatura, formato DD/MM/AAAA\n'
      + '- leituraAtual: data da leitura atual, formato DD/MM/AAAA\n'
      + '- classificacao: classe tarifaria da UC, ex: "B1", "B2", "B3", "B4", "A4", "A3a"\n'
      + '- energiaAtiva: kWh CONSUMIDOS da rede (Consumo TUSD + Consumo TE, ou "Energia Ativa Fornecida"), numero inteiro\n'
      + '- energiaInjetada: kWh ENVIADOS para a rede pela geracao solar — procure "Energia Injetada", "Geracao", "Excedente", "GD1", "GD2" (qualquer linha GD indica energia compensada/injetada). Se nao houver nenhuma dessas linhas, coloque 0. JAMAIS use o valor de consumo aqui, numero inteiro\n'
      + '- diferenca: energiaAtiva menos energiaInjetada em kWh, numero inteiro (pode ser negativo)\n'
      + '- consumo: kWh cobrados apos compensacao (consumo liquido efetivo), numero inteiro\n'
      + '- abatimento: kWh de abatimento/compensacao GD1 ou GD2 (comum na COSERN), numero inteiro\n'
      + '- bandeira: "verde", "amarela", "verm1" (Vermelha Patamar 1), "verm2" (Vermelha Patamar 2), ou null\n'
      + '- ipReais: valor de COSIP/CIP/Iluminacao Publica em reais, numero float (ex: 12.50)\n'
      + '- ip: percentual de COSIP/CIP/Iluminacao Publica, numero float (ex: 5.0); null se nao encontrado\n'
      + '- icms: percentual ICMS, numero float (ex: 12.0); null se nao encontrado\n\n'
      + 'TEXTO DA CONTA:\n'
      + texto.substring(0, 8000)
      + '\n\nJSON:';

    const aiResp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );

    const aiText = await aiResp.text();

    if (!aiResp.ok) {
      return res.status(500).json({ erro: 'Erro ao consultar IA (status ' + aiResp.status + '): ' + aiText.substring(0, 200) });
    }

    let aiData;
    try { aiData = JSON.parse(aiText); } catch (e) {
      return res.status(500).json({ erro: 'Resposta inesperada da IA' });
    }

    const raw = (((aiData.candidates || [])[0] || {}).content || {}).parts
      ? (aiData.candidates[0].content.parts[0].text || '')
      : '';
    const match = raw.match(/\{[\s\S]*\}/);
    let p = null;
    if (match) { try { p = JSON.parse(match[0]); } catch (e) { p = null; } }

    if (!p) {
      return res.status(422).json({ erro: 'Nenhum dado encontrado. Verifique se o PDF contém texto legível.' });
    }

    const num = v => (v != null && !isNaN(Number(v))) ? Number(v) : null;
    const numInt = v => num(v) !== null ? Math.round(num(v)) : null;

    return res.json({
      tipo,
      mes: p.mes || null,
      ano: p.ano ? String(p.ano) : null,
      uc: p.uc ? String(p.uc) : null,
      contrato: p.contrato ? String(p.contrato) : null,
      vencimento: p.vencimento || null,
      leituraAtual: p.leituraAtual || null,
      classificacao: p.classificacao || null,
      energiaAtiva: numInt(p.energiaAtiva),
      energiaInjetada: numInt(p.energiaInjetada),
      diferenca: numInt(p.diferenca),
      consumo: numInt(p.consumo),
      abatimento: numInt(p.abatimento),
      bandeira: p.bandeira || null,
      ipReais: num(p.ipReais),
      ip: num(p.ip),
      icms: num(p.icms)
    });

  } catch (e) {
    return res.status(500).json({ erro: 'Erro interno: ' + e.message });
  }
};
