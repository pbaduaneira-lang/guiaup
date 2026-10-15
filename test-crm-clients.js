const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

test('Banco de Dados de Clientes (CRM), Auto-Sincronização, Fidelidade e Importação para Viagem', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guiaup-crm-test-'));
  let proc;
  const port = 3258, base = 'http://127.0.0.1:' + port;

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

    const guide1 = client();
    const guide2 = client();

    // 1. Cadastra Guia 1 e Guia 2
    await guide1('/register', 'POST', {
      name: 'Carlos Guia',
      companyName: 'Carlos Tours',
      email: 'carlos@tours.com',
      password: 'senha-do-carlos',
      phone: '11999990001'
    });

    await guide2('/register', 'POST', {
      name: 'Renata Guia',
      companyName: 'Renata Ecotur',
      email: 'renata@ecotur.com',
      password: 'senha-da-renata',
      phone: '11999990002'
    });

    // 2. Guia 1 cadastra um cliente manualmente no CRM
    const newClientRes = await guide1('/clients', 'POST', {
      name: 'Juliana Paes',
      phone: '11988887777',
      notes: 'Gosta de sentar na janela, poltronas da frente.'
    });
    assert.equal(newClientRes.status, 200);
    assert.ok(newClientRes.data.id);
    const julianaId = newClientRes.data.id;

    // 3. Guia 1 consulta sua carteira de clientes
    let listRes = await guide1('/clients', 'GET');
    assert.equal(listRes.status, 200);
    assert.equal(listRes.data.length, 1);
    assert.equal(listRes.data[0].name, 'Juliana Paes');
    assert.equal(listRes.data[0].phone, '11988887777');
    assert.equal(listRes.data[0].trips_count, 0);

    // 4. Isolamento multi-tenant: Guia 2 não vê o cliente do Guia 1
    const guide2Clients = await guide2('/clients', 'GET');
    assert.equal(guide2Clients.status, 200);
    assert.equal(guide2Clients.data.length, 0);

    // 5. Guia 1 cria uma viagem vendida SEM valor por pessoa (omitindo price)
    const trip1Res = await guide1('/trips', 'POST', {
      title: 'Excursão Serra Negra - Grupo Fechado',
      destination: 'Serra Negra, SP',
      date: '2026-11-20',
      trip_type: 'group',
      capacity: 40,
      meeting: 'Estação Tietê às 07h00',
      description: 'Passeio em grupo fechado pelas malharias e fontes hidrominerais.'
      // price omitido propositalmente!
    });
    assert.equal(trip1Res.status, 200);
    const trip1Id = trip1Res.data.id;

    // 6. Guia 1 importa a cliente Juliana da carteira direto para a viagem 1
    const importRes = await guide1(`/trips/${trip1Id}/import-clients`, 'POST', {
      clientIds: [julianaId]
    });
    assert.equal(importRes.status, 200);
    assert.equal(importRes.data.count, 1);

    // 7. Guia 1 adiciona outro passageiro novo na viagem via batch list
    await guide1(`/trips/${trip1Id}/participants`, 'POST', {
      batchText: 'Rodrigo Faro - 11955554444\nMarcos Mion, 11944443333'
    });

    // 8. Verifica que os passageiros foram adicionados à viagem
    const trip1Details = await guide1(`/trips/${trip1Id}/state`, 'GET');
    assert.equal(trip1Details.data.trip.registered, 3);

    // 9. Verifica auto-sincronização na carteira do Guia 1: Rodrigo e Marcos foram cadastrados automaticamente!
    listRes = await guide1('/clients', 'GET');
    assert.equal(listRes.status, 200);
    assert.equal(listRes.data.length, 3); // Juliana, Rodrigo, Marcos
    const rodrigo = listRes.data.find(c => c.name.includes('Rodrigo'));
    assert.ok(rodrigo);
    assert.equal(rodrigo.phone, '11955554444');

    // 10. Verifica fidelidade: Juliana participou de 1 viagem agora
    const julianaUpdated = listRes.data.find(c => c.id === julianaId);
    assert.equal(julianaUpdated.trips_count, 1);

    // 11. Guia 1 cria segunda viagem (expositor ou grupo) e importa Juliana novamente
    const trip2Res = await guide1('/trips', 'POST', {
      title: 'Passeio Campos do Jordão',
      destination: 'Campos do Jordão, SP',
      date: '2026-12-10',
      trip_type: 'group',
      capacity: 30,
      meeting: 'Estação Barra Funda',
      description: 'Festival de Inverno e passeios.'
    });
    const trip2Id = trip2Res.data.id;

    await guide1(`/trips/${trip2Id}/import-clients`, 'POST', {
      clientIds: [julianaId]
    });

    // 12. Verifica que a contagem de fidelidade da Juliana agora é 2 viagens!
    listRes = await guide1('/clients', 'GET');
    const julianaFiel = listRes.data.find(c => c.id === julianaId);
    assert.equal(julianaFiel.trips_count, 2);

    // 13. Guia 1 edita dados do cliente Juliana (notas e telefone)
    const patchRes = await guide1(`/clients/${julianaId}`, 'PATCH', {
      name: 'Juliana Paes VIP',
      phone: '11988887777',
      notes: 'Cliente Fiel VIP! Gosta de vinho e poltrona 5.'
    });
    assert.equal(patchRes.status, 200);

    // 14. Guia 1 exclui Rodrigo da carteira
    const deleteRes = await guide1(`/clients/${rodrigo.id}`, 'DELETE');
    assert.equal(deleteRes.status, 200);

    listRes = await guide1('/clients', 'GET');
    assert.equal(listRes.data.length, 2);
    assert.ok(!listRes.data.some(c => c.id === rodrigo.id));

    console.log('CRM de Clientes, auto-sync, fidelidade e importação validados com 100% de sucesso!');
  } finally {
    await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
