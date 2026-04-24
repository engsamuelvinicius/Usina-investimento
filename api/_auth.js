const admin = require('./_firebase');

async function autenticar(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new Error('Não autenticado');
  const decoded = await admin.auth().verifyIdToken(token);
  return decoded.uid;
}

module.exports = autenticar;
