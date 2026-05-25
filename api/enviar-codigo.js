const admin = require('./_firebase');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ erro: 'E-mail não fornecido' });

    // Verificar se o usuário existe no Firebase Auth
    try {
      await admin.auth().getUserByEmail(email);
    } catch (e) {
      return res.status(404).json({ erro: 'E-mail não encontrado.' });
    }

    // Gerar código de 6 dígitos
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = Date.now() + 15 * 60 * 1000;

    // Armazenar no Firestore
    await admin.firestore().collection('reset_codes').doc(email).set({ code, expires });

    // Enviar por e-mail via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return res.status(400).json({
        erro: 'Serviço de e-mail não configurado. Adicione RESEND_API_KEY nas variáveis de ambiente do Vercel.'
      });
    }

    const from = process.env.RESEND_FROM || 'onboarding@resend.dev';

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: 'Código de recuperação de senha',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:32px;background:#f4f7f4;border-radius:12px">
            <h2 style="color:#1a4422;margin:0 0 8px">Recuperação de senha</h2>
            <p style="color:#555;margin:0 0 24px;line-height:1.6">
              Use o código abaixo para redefinir sua senha.<br>
              Ele é válido por <strong>15 minutos</strong>.
            </p>
            <div style="background:#fff;border:2px solid #1a4422;border-radius:10px;padding:28px;text-align:center;letter-spacing:10px;font-size:36px;font-weight:bold;color:#1a4422;font-family:monospace">
              ${code}
            </div>
            <p style="color:#aaa;font-size:12px;margin-top:20px;line-height:1.5">
              Se você não solicitou a recuperação de senha, ignore este e-mail.
            </p>
          </div>
        `
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return res.status(400).json({ erro: 'Erro ao enviar e-mail: ' + (err.message || 'tente novamente') });
    }

    return res.json({ ok: true });

  } catch (e) {
    console.error('enviar-codigo error:', e.message);
    return res.status(500).json({ erro: e.message });
  }
};
