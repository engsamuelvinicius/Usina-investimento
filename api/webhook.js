const admin = require('./_firebase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const evento = req.body;
    if (!evento || !evento.payment) return res.status(200).end();

    const payment = evento.payment;
    const extRef = payment.externalReference;
    if (!extRef) return res.status(200).end();

    let ref;
    try { ref = JSON.parse(extRef); } catch { return res.status(200).end(); }

    const { uid, usinaId, clienteId, mes } = ref;
    if (!uid || !usinaId) return res.status(200).end();

    const status = payment.status;
    const pago = ['RECEIVED', 'CONFIRMED'].includes(status);

    await admin.firestore()
      .collection('integradores').doc(uid)
      .collection('cobranças').doc(payment.id)
      .set({
        usinaId,
        clienteId,
        mes,
        status,
        valor: payment.value,
        pagoEm: pago ? new Date().toISOString() : null,
        atualizadoEm: new Date().toISOString(),
      }, { merge: true });

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Webhook error:', e.message);
    res.status(500).json({ erro: e.message });
  }
};
