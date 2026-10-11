const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

test('Multi-empresa: cadastro, logo, 3 fotos da viagem, parcelamento, teste grátis 7 dias e assinatura', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guiaup-company-test-'));
  let proc;
  const port = 3199, base = 'http://127.0.0.1:' + port;

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
    const traveler = client();

    // 1. Cadastra Empresa 1 com Logo
    const logoMock = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const regRes = await guide1('/register', 'POST', {
      name: 'Carlos Oliveira',
      companyName: 'Trilhas & Rumos Ecoturismo',
      email: 'carlos@trilhas.com.br',
      password: 'senha-segura-123',
      phone: '(11) 98888-7777',
      logoData: logoMock
    });
    assert.equal(regRes.status, 200);
    assert.equal(regRes.data.guide.company_name, 'Trilhas & Rumos Ecoturismo');
    assert.equal(regRes.data.guide.subscription_status, 'trial');
    assert.equal(regRes.data.guide.trial_days_left, 7);

    // 2. Verifica /api/me para o Guia 1
    const me1 = await guide1('/me');
    assert.equal(me1.data.role, 'guide');
    assert.equal(me1.data.guide.company_name, 'Trilhas & Rumos Ecoturismo');
    assert.equal(me1.data.guide.logo_data, logoMock);

    // 3. Cadastra Empresa 2
    const reg2 = await guide2('/register', 'POST', {
      name: 'Juliana Costa',
      companyName: 'Serra & Mar Viagens',
      email: 'juliana@serraemar.com',
      password: 'outra-senha-forte',
      phone: '(21) 97777-6666'
    });
    assert.equal(reg2.status, 200);

    // 4. Guia 1 cria viagem da Trilhas & Rumos com 3 fotos, data de retorno e parcelamento
    const photo1 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    const photo2 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    const photo3 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    const trip1 = {
      title: 'Chapada dos Veadeiros 4D',
      destination: 'Alto Paraíso · GO',
      date: '2026-11-20',
      date_return: '2026-11-23',
      price: 1250,
      installment_text: 'ou em até 6x de R$ 235 no cartão',
      capacity: 15,
      description: 'Cachoeiras e cânions com guia credenciado.',
      meeting: 'Aeroporto BSB 08h',
      photos: [photo1, photo2, photo3],
      published: true
    };
    const t1Res = await guide1('/trips', 'POST', trip1);
    assert.equal(t1Res.status, 200);
    const tripId = t1Res.data.id;

    // 5. Guia 2 não deve ver a viagem do Guia 1 no seu painel privado
    const tripsGuide2 = (await guide2('/trips')).data;
    assert.equal(tripsGuide2.length, 0);

    // 6. Passageiro se cadastra na viagem e vê a marca da Trilhas & Rumos, datas, valores e as 3 fotos
    const joinRes = await traveler('/join', 'POST', { tripId, name: 'Marcos Silva' });
    assert.equal(joinRes.status, 200);

    const tripState = (await traveler('/trips/' + tripId + '/state')).data;
    assert.equal(tripState.trip.title, trip1.title);
    assert.equal(tripState.trip.date_return, '2026-11-23');
    assert.equal(tripState.trip.installment_text, 'ou em até 6x de R$ 235 no cartão');
    assert.equal(tripState.trip.photos.length, 3);
    assert.ok(tripState.company);
    assert.equal(tripState.company.name, 'Trilhas & Rumos Ecoturismo');
    assert.equal(tripState.company.logo, logoMock);
    assert.equal(tripState.company.guide_name, 'Carlos Oliveira');

    // 7. Atualização de Logo / Perfil da Empresa
    const newLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNkYPj/nwEIGBkYAAYVA/05m90AAAAABJRU5ErkJggg==';
    const updateRes = await guide1('/guide/profile', 'PATCH', {
      name: 'Carlos Oliveira Santos',
      companyName: 'Trilhas & Rumos Ecoturismo VIP',
      phone: '(11) 99999-0000',
      logoData: newLogo
    });
    assert.equal(updateRes.status, 200);

    const updatedMe = (await guide1('/me')).data.guide;
    assert.equal(updatedMe.company_name, 'Trilhas & Rumos Ecoturismo VIP');
    assert.equal(updatedMe.logo_data, newLogo);

    // 8. Assinatura Pro
    const subRes = await guide1('/guide/subscription', 'POST', {});
    assert.equal(subRes.status, 200);
    assert.equal(subRes.data.status, 'active');

    const meAfterSub = (await guide1('/me')).data.guide;
    assert.equal(meAfterSub.subscription_status, 'active');

    console.log('Multi-empresa, 3 fotos do destino, parcelamento, teste grátis e assinatura Pro validados com sucesso!');
  } finally {
    if (proc && proc.exitCode === null) await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
