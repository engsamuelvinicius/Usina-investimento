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
    const { email, codigo, novaSenha } = req.body || {};
    if (!email || !codigo || !novaSenha) {
      return res.status(400).json({ erro: 'Dados inválidos' });
    }

    // Buscar código no Firestore
    const doc = await admin.firestore().collection('reset_codes').doc(email).get();
    if (!doc.exists) {
      return res.status(400).json({ erro: 'Código inválido ou expirado.' });
    }

    const { code, expires } = doc.data();

    if (Date.now() > expires) {
      await admin.firestore().collection('reset_codes').doc(email).delete();
      return res.status(400).json({ erro: 'Código expirado. Solicite um novo.' });
    }

    if (codigo !== code) {
      return res.status(400).json({ erro: 'Código incorreto. Verifique e tente novamente.' });
    }

    // Atualizar senha no Firebase Auth
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, { password: novaSenha });

    // Deletar código já usado
    await admin.firestore().collection('reset_codes').doc(email).delete();

    return res.json({ ok: true });

  } catch (e) {
    console.error('verificar-redefinir error:', e.message);
    return res.status(500).json({ erro: e.message });
  }
};
