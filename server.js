const http = require('node:http');
const { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { q, one, run, initDb, isTurso } = require('./db.js');

try { process.loadEnvFile(); } catch {}

const PORT = Number(process.env.PORT || 3080);
const digest = s => createHash('sha256').update(s).digest('hex');
const rate = new Map();

async function configured() {
  const hasPass = await one("SELECT value FROM settings WHERE key='password'");
  if (hasPass) return true;
  const countG = await one("SELECT count(*) AS n FROM guides");
  return Boolean(countG?.n);
}

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}

function str(v, max = 200, field = 'campo') {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > max) {
    fail(400, `Preencha o campo ${field} corretamente.`);
  }
  return v.trim();
}

function tripData(b) {
  const title = str(b.title, 100, 'título');
  const destination = str(b.destination, 100, 'destino');
  const date = str(b.date, 10, 'data de saída');
  const date_return = typeof b.date_return === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date_return.trim())
    ? b.date_return.trim()
    : (typeof b.dateReturn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.dateReturn.trim()) ? b.dateReturn.trim() : '');
  const description = str(b.description, 2000, 'descrição');
  const meeting = str(b.meeting, 300, 'ponto de encontro');
  const price = Number(b.price);
  const installment_text = typeof b.installment_text === 'string'
    ? b.installment_text.trim().slice(0, 150)
    : (typeof b.installmentText === 'string' ? b.installmentText.trim().slice(0, 150) : '');
  const capacity = Number(b.capacity);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(price) || price < 0 || !Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
    fail(400, 'Confira data, preço e número de vagas.');
  }

  let photos = '[]';
  if (Array.isArray(b.photos)) {
    photos = JSON.stringify(b.photos.slice(0, 3).filter(p => typeof p === 'string' && p.startsWith('data:image/')).map(p => p.slice(0, 900000)));
  } else if (typeof b.photos === 'string' && b.photos.startsWith('[')) {
    try {
      const parsed = JSON.parse(b.photos);
      if (Array.isArray(parsed)) {
        photos = JSON.stringify(parsed.slice(0, 3).filter(p => typeof p === 'string' && p.startsWith('data:image/')).map(p => p.slice(0, 900000)));
      }
    } catch {}
  }

  return {
    title,
    destination,
    date,
    date_return,
    price,
    installment_text,
    capacity,
    description,
    meeting,
    photos,
    published: b.published === false ? 0 : 1
  };
}

async function getTrip(id) {
  const t = await one('SELECT * FROM trips WHERE id=?', id);
  if (!t) fail(404, 'Viagem não encontrada.');
  return t;
}

async function session(req) {
  const match = (req.headers.cookie || '').match(/(?:^|;\s*)guiaup=([a-f0-9]+)/);
  if (!match) return null;
  return await one('SELECT * FROM sessions WHERE token=? AND expires>?', digest(match[1]), Date.now());
}

async function issue(res, role, participant = null, guideId = null) {
  const token = randomBytes(32).toString('hex');
  await run('INSERT INTO sessions VALUES(?,?,?,?,?)', digest(token), role, participant, guideId, Date.now() + 7 * 86400000);
  res.setHeader('Set-Cookie', `guiaup=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
}

function guide(s) {
  if (!s || s.role !== 'guide') fail(403, 'Entre como guia para continuar.');
}

async function count(id) {
  const res = await one('SELECT count(*) AS n FROM participants WHERE trip_id=?', id);
  return res ? res.n : 0;
}

async function addParticipant(t, b) {
  const currentCount = await count(t.id);
  if (currentCount >= t.capacity) fail(409, 'Esta viagem está lotada.');
  const id = randomUUID();
  const name = str(b.name, 100, 'nome');
  const phone = typeof b.phone === 'string' ? b.phone.trim().slice(0, 30) : '';
  await run('INSERT INTO participants(id,trip_id,name,phone) VALUES(?,?,?,?)', id, t.id, name, phone);
  return id;
}

async function body(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 4194304) fail(413, 'Dados muito grandes (limite de 4MB).');
  }
  try {
    return JSON.parse(data || '{}');
  } catch {
    fail(400, 'JSON inválido.');
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");

  try {
    const u = new URL(req.url, 'http://localhost');
    if (!u.pathname.startsWith('/api/')) {
      const files = {
        '/': 'index.html',
        '/app.js': 'app.js',
        '/styles.css': 'styles.css',
        '/manifest.webmanifest': 'manifest.webmanifest',
        '/icon.svg': 'icon.svg',
        '/icon-192.png': 'icon-192.png',
        '/icon-512.png': 'icon-512.png',
        '/.well-known/assetlinks.json': path.join('.well-known', 'assetlinks.json')
      };
      const f = files[u.pathname];
      if (!f) fail(404, 'Não encontrado.');
      res.setHeader('Content-Type', {
        'html': 'text/html; charset=utf-8',
        'js': 'text/javascript; charset=utf-8',
        'css': 'text/css; charset=utf-8',
        'webmanifest': 'application/manifest+json',
        'svg': 'image/svg+xml',
        'png': 'image/png',
        'json': 'application/json; charset=utf-8'
      }[f.split('.').pop()]);
      res.end(fs.readFileSync(path.join(__dirname, 'public', f)));
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (!['GET', 'POST', 'PATCH'].includes(req.method)) fail(405, 'Método não permitido.');
    if (req.method !== 'GET' && req.headers.origin) {
      const origin = new URL(req.headers.origin);
      if (origin.host !== req.headers.host) fail(403, 'Origem não autorizada.');
    }

    const b = req.method === 'GET' ? {} : await body(req);
    const s = await session(req);
    const route = u.pathname;
    let result;

    if (route === '/api/me' && req.method === 'GET') {
      const participant = s?.role === 'guest' ? await one('SELECT * FROM participants WHERE id=?', s.participant_id) : null;
      let guideData = null;
      if (s?.role === 'guide') {
        const g = s.guide_id ? await one('SELECT * FROM guides WHERE id=?', s.guide_id) : null;
        if (g) {
          guideData = {
            id: g.id,
            name: g.name,
            company_name: g.company_name,
            email: g.email,
            phone: g.phone,
            logo_data: g.logo_data,
            subscription_status: g.subscription_status,
            trial_ends_at: g.trial_ends_at,
            trial_days_left: Math.max(0, Math.ceil((g.trial_ends_at - Date.now()) / 86400000))
          };
        } else {
          guideData = {
            id: 'legacy',
            name: 'Guia',
            company_name: 'Minha Agência',
            email: 'admin@local',
            phone: '',
            logo_data: '',
            subscription_status: 'active',
            trial_ends_at: Date.now() + 86400000 * 365,
            trial_days_left: 365
          };
        }
      }
      result = {
        configured: await configured(),
        role: s?.role || null,
        participant,
        guide: guideData,
        serverTime: Date.now()
      };
    }
    else if (route === '/api/setup' && req.method === 'POST') {
      if (await configured()) fail(409, 'O guia já foi configurado.');
      const password = str(b.password, 128, 'senha');
      if (password.length < 10) fail(400, 'Use uma senha com pelo menos 10 caracteres.');
      const salt = randomBytes(16).toString('hex');
      await run("INSERT INTO settings VALUES('salt',?)", salt);
      await run("INSERT INTO settings VALUES('password',?)", scryptSync(password, salt, 64).toString('hex'));
      const gid = randomUUID();
      await run(
        "INSERT INTO guides VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        gid,
        'Guia Administrador',
        'Minha Agência',
        'admin@local',
        scryptSync(password, salt, 64).toString('hex'),
        salt,
        '',
        '',
        'active',
        Date.now() + 86400000 * 365,
        Date.now()
      );
      await issue(res, 'guide', null, gid);
      result = { ok: true };
    }
    else if (route === '/api/register' && req.method === 'POST') {
      const name = str(b.name, 100, 'nome do responsável');
      const company_name = str(b.companyName || b.company_name, 100, 'nome da empresa');
      const email = str(b.email, 120, 'e-mail').toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Informe um e-mail válido.');
      const password = str(b.password, 128, 'senha');
      if (password.length < 8) fail(400, 'A senha deve ter pelo menos 8 caracteres.');
      if (await one('SELECT id FROM guides WHERE email=?', email)) fail(409, 'Este e-mail já está cadastrado.');

      const phone = typeof b.phone === 'string' ? b.phone.trim().slice(0, 30) : '';
      const logo_data = typeof b.logoData === 'string' ? b.logoData.trim().slice(0, 1500000) : '';
      const salt = randomBytes(16).toString('hex');
      const hash = scryptSync(password, salt, 64).toString('hex');
      const id = randomUUID();
      const trial_ends_at = Date.now() + 7 * 86400000;

      await run(
        'INSERT INTO guides VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        id,
        name,
        company_name,
        email,
        hash,
        salt,
        phone,
        logo_data,
        'trial',
        trial_ends_at,
        Date.now()
      );
      await issue(res, 'guide', null, id);
      result = {
        ok: true,
        guide: { id, name, company_name, email, phone, logo_data, subscription_status: 'trial', trial_days_left: 7 }
      };
    }
    else if (route === '/api/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress;
      let r = rate.get(ip);
      if (!r || r.until < Date.now()) {
        r = { n: 0, until: Date.now() + 600000 };
        rate.set(ip, r);
      }
      if (r.n >= 15) fail(429, 'Muitas tentativas. Aguarde 10 minutos.');
      r.n++;

      const password = str(b.password, 128, 'senha');
      const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : null;

      if (email) {
        const g = await one('SELECT * FROM guides WHERE email=?', email);
        if (!g) fail(401, 'E-mail ou senha incorretos.');
        const check = scryptSync(password, g.salt, 64).toString('hex');
        if (!timingSafeEqual(Buffer.from(g.password, 'hex'), Buffer.from(check, 'hex'))) {
          fail(401, 'E-mail ou senha incorretos.');
        }
        rate.delete(ip);
        await issue(res, 'guide', null, g.id);
        result = { ok: true };
      } else {
        if (!(await configured())) fail(409, 'Configure o guia primeiro.');
        const storedRow = await one("SELECT value FROM settings WHERE key='password'");
        const saltRow = await one("SELECT value FROM settings WHERE key='salt'");
        let matched = false;
        let gid = null;
        if (storedRow && saltRow) {
          const check = scryptSync(password, saltRow.value, 64).toString('hex');
          if (timingSafeEqual(Buffer.from(storedRow.value, 'hex'), Buffer.from(check, 'hex'))) {
            matched = true;
            const firstG = await one('SELECT id FROM guides LIMIT 1');
            gid = firstG?.id || null;
          }
        }
        if (!matched) {
          const firstGuide = await one('SELECT * FROM guides LIMIT 1');
          if (firstGuide) {
            const check = scryptSync(password, firstGuide.salt, 64).toString('hex');
            if (timingSafeEqual(Buffer.from(firstGuide.password, 'hex'), Buffer.from(check, 'hex'))) {
              matched = true;
              gid = firstGuide.id;
            }
          }
        }
        if (!matched) fail(401, 'Senha incorreta.');
        rate.delete(ip);
        await issue(res, 'guide', null, gid);
        result = { ok: true };
      }
    }
    else if (route === '/api/logout' && req.method === 'POST') {
      if (s) await run('DELETE FROM sessions WHERE token=?', s.token);
      res.setHeader('Set-Cookie', 'guiaup=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
      result = { ok: true };
    }
    else if (route === '/api/guide/profile' && req.method === 'PATCH') {
      guide(s);
      if (!s.guide_id) fail(400, 'Guia não vinculado.');
      const g = await one('SELECT * FROM guides WHERE id=?', s.guide_id);
      if (!g) fail(404, 'Cadastro não encontrado.');

      const name = str(b.name, 100, 'nome do responsável');
      const company_name = str(b.companyName || b.company_name, 100, 'nome da empresa');
      const phone = typeof b.phone === 'string' ? b.phone.trim().slice(0, 30) : g.phone;
      const logo_data = typeof b.logoData === 'string' ? b.logoData.trim().slice(0, 1500000) : (typeof b.logo_data === 'string' ? b.logo_data : g.logo_data);

      await run('UPDATE guides SET name=?, company_name=?, phone=?, logo_data=? WHERE id=?', name, company_name, phone, logo_data, s.guide_id);
      result = { ok: true };
    }
    else if (route === '/api/guide/subscription' && req.method === 'POST') {
      guide(s);
      if (!s.guide_id) fail(400, 'Guia não vinculado.');
      await run("UPDATE guides SET subscription_status='active', trial_ends_at=? WHERE id=?", Date.now() + 30 * 86400000, s.guide_id);
      result = { ok: true, status: 'active', message: 'Assinatura Pro ativada com sucesso!' };
    }
    else if (route === '/api/trips' && req.method === 'GET') {
      let trips;
      if (s?.role === 'guide') {
        trips = s.guide_id
          ? await q('SELECT t.*, g.company_name, g.logo_data FROM trips t LEFT JOIN guides g ON t.guide_id = g.id WHERE t.guide_id = ? OR t.guide_id IS NULL ORDER BY t.date', s.guide_id)
          : await q('SELECT t.*, g.company_name, g.logo_data FROM trips t LEFT JOIN guides g ON t.guide_id = g.id ORDER BY t.date');
      } else {
        trips = await q('SELECT t.*, g.company_name, g.logo_data FROM trips t LEFT JOIN guides g ON t.guide_id = g.id WHERE t.published = 1 ORDER BY t.date');
      }

      const list = [];
      for (const t of trips) {
        let photosList = [];
        try { photosList = JSON.parse(t.photos || '[]'); } catch {}
        const reg = await count(t.id);
        list.push({
          ...t,
          photos: photosList,
          registered: reg
        });
      }
      result = list;
    }
    else if (route === '/api/trips' && req.method === 'POST') {
      guide(s);
      if (s.guide_id) {
        const g = await one('SELECT * FROM guides WHERE id=?', s.guide_id);
        if (g && g.subscription_status === 'trial' && g.trial_ends_at < Date.now()) {
          fail(402, 'Seu período de teste grátis terminou. Ative o Plano Pro para cadastrar novas viagens.');
        }
      }
      const t = tripData(b);
      const id = randomUUID();
      await run(
        'INSERT INTO trips(id,guide_id,title,destination,date,date_return,price,installment_text,capacity,description,meeting,photos,published) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        id,
        s.guide_id || null,
        t.title,
        t.destination,
        t.date,
        t.date_return,
        t.price,
        t.installment_text,
        t.capacity,
        t.description,
        t.meeting,
        t.photos,
        t.published
      );
      result = { id };
    }
    else if (route === '/api/access' && req.method === 'POST') {
      if (s?.role === 'guide') fail(400, 'Abra o acesso do participante em uma janela privada.');
      const link = await one('SELECT * FROM participant_links WHERE token=? AND expires>?', digest(str(b.token, 100, 'token')), Date.now());
      if (!link) fail(403, 'Link inválido ou expirado. Peça um novo link ao guia.');
      await issue(res, 'guest', link.participant_id);
      result = { ok: true };
    }
    else if (route === '/api/join' && req.method === 'POST') {
      if (!(await configured())) fail(409, 'Aguarde o guia configurar o app.');
      const t = await getTrip(str(b.tripId, 50, 'viagem'));
      if (!t.published) fail(404, 'Viagem indisponível.');
      if (s?.role === 'guide') fail(400, 'Use uma janela privada para entrar como participante.');
      if (s?.participant_id) fail(409, 'Você já está cadastrado neste navegador.');
      const id = await addParticipant(t, b);
      await issue(res, 'guest', id);
      result = { id };
    }
    else {
      const m = route.match(/^\/api\/trips\/([a-z0-9-]+)(?:\/(state|participants|stop|messages|presence|access))?$/);
      if (!m) fail(404, 'Operação não encontrada.');
      const id = m[1], t = await getTrip(id), action = m[2];

      if (!action && req.method === 'PATCH') {
        guide(s);
        const v = tripData(b);
        const currentCount = await count(id);
        if (v.capacity < currentCount) fail(409, 'Há mais inscritos do que o limite informado.');
        await run(
          'UPDATE trips SET title=?,destination=?,date=?,date_return=?,price=?,installment_text=?,capacity=?,description=?,meeting=?,photos=?,published=? WHERE id=?',
          v.title, v.destination, v.date, v.date_return, v.price, v.installment_text, v.capacity, v.description, v.meeting, v.photos, v.published, id
        );
        result = { ok: true };
      }
      else if (action === 'state' && req.method === 'GET') {
        if (s?.role !== 'guide' && (!s?.participant_id || (await one('SELECT trip_id FROM participants WHERE id=?', s.participant_id))?.trip_id !== id)) {
          fail(403, 'Cadastre-se nesta viagem para acessar.');
        }
        const guideInfo = t.guide_id ? await one('SELECT name, company_name, phone, logo_data FROM guides WHERE id=?', t.guide_id) : null;
        let photosList = [];
        try { photosList = JSON.parse(t.photos || '[]'); } catch {}
        const reg = await count(id);
        const stopRow = await one('SELECT * FROM stops WHERE trip_id=?', id);
        const messagesRows = await q('SELECT * FROM messages WHERE trip_id=? ORDER BY created_at DESC LIMIT 30', id);

        result = {
          trip: {
            ...t,
            photos: photosList,
            registered: reg
          },
          company: guideInfo ? {
            name: guideInfo.company_name,
            guide_name: guideInfo.name,
            phone: guideInfo.phone,
            logo: guideInfo.logo_data
          } : null,
          stop: stopRow || null,
          messages: messagesRows,
          serverTime: Date.now()
        };
      }
      else if (action === 'participants' && req.method === 'GET') {
        guide(s);
        result = await q('SELECT * FROM participants WHERE trip_id=? ORDER BY name', id);
      }
      else if (action === 'participants' && req.method === 'POST') {
        guide(s);
        result = { id: await addParticipant(t, b) };
      }
      else if (action === 'access' && req.method === 'POST') {
        guide(s);
        const pid = str(b.id, 50, 'participante');
        if (!(await one('SELECT id FROM participants WHERE id=? AND trip_id=?', pid, id))) fail(404, 'Participante não encontrado.');
        const token = randomBytes(32).toString('hex');
        await run('INSERT INTO participant_links VALUES(?,?,?)', digest(token), pid, Date.now() + 7 * 86400000);
        result = { token };
      }
      else if (action === 'presence' && req.method === 'POST') {
        const pid = str(b.id, 50, 'participante');
        if (s?.role !== 'guide' && s?.participant_id !== pid) fail(403, 'Acesso negado.');
        if (!(await one('SELECT id FROM participants WHERE id=? AND trip_id=?', pid, id))) fail(404, 'Participante não encontrado.');
        await run('UPDATE participants SET present=? WHERE id=?', b.present ? 1 : 0, pid);
        result = { ok: true };
      }
      else if (action === 'stop' && req.method === 'POST') {
        guide(s);
        if (b.cancel) {
          await run('UPDATE stops SET cancelled=1 WHERE trip_id=?', id);
          result = { ok: true };
        } else {
          const seconds = Number(b.seconds);
          if (!Number.isInteger(seconds) || seconds < 5 || seconds > 14400) {
            fail(400, 'A parada deve durar entre 5 segundos e 4 horas.');
          }
          const label = str(b.label, 200, 'motivo da parada');
          const end = Date.now() + seconds * 1000;
          await run('UPDATE participants SET present=0 WHERE trip_id=?', id);
          await run(
            'INSERT INTO stops VALUES(?,?,?,?,?,0) ON CONFLICT(trip_id) DO UPDATE SET id=excluded.id,label=excluded.label,ends_at=excluded.ends_at,duration=excluded.duration,cancelled=0',
            id, randomUUID(), label, end, seconds
          );
          result = { endsAt: end };
        }
      }
      else if (action === 'messages' && req.method === 'POST') {
        guide(s);
        await run('INSERT INTO messages VALUES(?,?,?,?)', randomUUID(), id, str(b.text, 1000, 'mensagem'), Date.now());
        result = { ok: true };
      }
      else {
        fail(405, 'Operação não permitida.');
      }
    }

    res.end(JSON.stringify(result));
  } catch (e) {
    res.statusCode = e.status || 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: e.status ? e.message : 'Não foi possível concluir. Tente novamente.' }));
    if (!e.status) console.error(e);
  }
});

initDb().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`GuiaUp em http://localhost:${PORT} • Banco: ${isTurso ? 'Turso Cloud (AWS SP)' : 'SQLite Local'}`);
  });
}).catch(err => {
  console.error('Falha ao inicializar o banco de dados:', err);
  process.exit(1);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
