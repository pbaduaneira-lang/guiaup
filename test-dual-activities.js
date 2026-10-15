const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

test('Duas Atividades do Guia: Viagem Vendida vs Expositor, Lote de Passageiros e WhatsApp', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guiaup-dual-test-'));
  let proc;
  const port = 3255, base = 'http://127.0.0.1:' + port;

  async function start() {
    proc = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      env: { ...process.env, PORT: String(port), GUIAUP_DATA: dir },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Servidor não iniciou')), 8000);
      proc.stdout.once('data', () => { clearTimeout(timer); resolve(); });
      proc.once('error', reject);
    });
  }

  async function stop() {
    const p = proc;
    await new Promise(resolve => { p.once('exit', resolve); p.kill(); });
  }

  function client() {
    let cookie = '';
    return async (url, method = 'GET', body) => {
      const r = await fetch(base + '/api' + url, {
        method,
        headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined
      });
      if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
      return { status: r.status, data: await r.json() };
    };
  }

  try {
    await start();

    const guide = client();
    const visitor = client();

    // 1. Cadastra o Guia
    const regRes = await guide('/register', 'POST', {
      name: 'Marcos Guia',
      companyName: 'Aventura Real Turismo',
      email: 'marcos@aventurareal.com',
      password: 'senha-segura-marcos',
      phone: '(11) 99999-8888'
    });
    assert.equal(regRes.status, 200);

    // 2. Cria Atividade 1: Viagem Vendida (Grupo Fechado / Operação)
    const soldTrip = {
      title: 'Excursão Serra Negra - Grupo Terceira Idade',
      destination: 'Serra Negra · SP',
      date: '2026-11-15',
      date_return: '2026-11-17',
      price: 450,
      capacity: 40,
      description: 'Passeio com hospedagem e paradas para compras.',
      meeting: 'Terminal Tietê 06h30',
      published: false,
      trip_type: 'group'
    };
    const soldRes = await guide('/trips', 'POST', soldTrip);
    assert.equal(soldRes.status, 200);
    const soldId = soldRes.data.id;
    assert.ok(soldId);

    // 3. Cria Atividade 2: Expositor de Vendas (Vitrine Pública)
    const showcaseTrip = {
      title: 'Reveillon Mágico em Ubatuba',
      destination: 'Ubatuba · SP',
      date: '2026-12-30',
      date_return: '2027-01-02',
      price: 890,
      installment_text: 'ou até 4x de R$ 235 no cartão',
      capacity: 45,
      description: 'Praias paradisíacas e queima de fogos.',
      meeting: 'Metrô Barra Funda 22h00',
      published: true,
      trip_type: 'showcase'
    };
    const showRes = await guide('/trips', 'POST', showcaseTrip);
    assert.equal(showRes.status, 200);
    const showId = showRes.data.id;

    // 4. Verifica se a vitrine pública só mostra a viagem do expositor
    const publicTrips = await visitor('/trips');
    assert.equal(publicTrips.data.length, 1);
    assert.equal(publicTrips.data[0].id, showId);

    // 5. Guia lista suas viagens e vê as duas atividades com trip_type
    const myTrips = await guide('/trips');
    assert.equal(myTrips.data.length, 2);
    const tSold = myTrips.data.find(t => t.id === soldId);
    const tShow = myTrips.data.find(t => t.id === showId);
    assert.equal(tSold.trip_type, 'group');
    assert.equal(tShow.trip_type, 'showcase');

    // 6. Cadastra lista de passageiros em lote (batch text) na viagem vendida
    const batchText = `Ana Paula Souza - (11) 98888-1111\nCarlos Alberto Silva, 11977772222\nMariana Oliveira`;
    const batchRes = await guide(`/trips/${soldId}/participants`, 'POST', { batchText });
    assert.equal(batchRes.status, 200);
    assert.equal(batchRes.data.count, 3);

    // 7. Confere os participantes cadastrados
    const participants = await guide(`/trips/${soldId}/participants`);
    assert.equal(participants.data.length, 3);
    assert.equal(participants.data[0].present, 0);

    // 8. Gera token de acesso para o WhatsApp do primeiro passageiro
    const p1 = participants.data[0];
    const tokenRes = await guide(`/trips/${soldId}/access`, 'POST', { id: p1.id });
    assert.equal(tokenRes.status, 200);
    assert.ok(tokenRes.data.token);

    // 9. Passageiro entra pelo token e confirma presença ("Já voltei ao ônibus")
    const traveler = client();
    const accessRes = await traveler('/access', 'POST', { token: tokenRes.data.token });
    assert.equal(accessRes.status, 200);

    const meRes = await traveler('/me');
    assert.equal(meRes.data.role, 'guest');
    assert.equal(meRes.data.participant.id, p1.id);

    // Confirma presença
    const presRes = await traveler(`/trips/${soldId}/presence`, 'POST', { id: p1.id, present: true });
    assert.equal(presRes.status, 200);

    // Guia confere a chamada em tempo real: p1 presente, os outros ausentes
    const updatedParticipants = await guide(`/trips/${soldId}/participants`);
    const p1Updated = updatedParticipants.data.find(p => p.id === p1.id);
    assert.equal(p1Updated.present, 1);

    // 10. Guia inicia uma parada: todos os passageiros voltam a ficar com present=0
    await guide(`/trips/${soldId}/stop`, 'POST', { label: 'Graal 20 min', seconds: 1200 });
    const afterStop = await guide(`/trips/${soldId}/participants`);
    assert.equal(afterStop.data.find(p => p.id === p1.id).present, 0);

    // 11. Guia remove um participante que cancelou
    const p3 = participants.data[2];
    const delRes = await guide(`/trips/${soldId}/participants`, 'DELETE', { id: p3.id });
    assert.equal(delRes.status, 200);

    const finalParticipants = await guide(`/trips/${soldId}/participants`);
    assert.equal(finalParticipants.data.length, 2);

    console.log('Duas atividades do guia, lote de passageiros, WhatsApp e presença validados com 100% de sucesso!');
  } finally {
    if (proc && proc.exitCode === null) await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
