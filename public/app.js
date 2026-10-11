const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const modalContent = document.querySelector('#modal-content');

let me = {};
let trips = [];
let view = 'home';
let activeId = null;
let state = null;
let participants = [];
let offset = 0;
let connected = false;
let lastSync = 0;
let audio = null;
let sound = false;
let alarmId = null;
let polling = false;
let tempLogo = '';
let tempPhotos = ['', '', ''];

const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = v => {
  if (!v) return '';
  return new Date(v + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};
const button = (action, label, cls = '', extra = '') => `<button class="button ${cls}" data-action="${action}" ${extra}>${label}</button>`;

async function api(url, method = 'GET', data) {
  const r = await fetch('/api' + url, {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data ? JSON.stringify(data) : undefined
  });
  const v = await r.json();
  if (!r.ok) throw Error(v.error || 'Erro de conexão.');
  return v;
}

function toast(t) {
  const el = document.querySelector('#toast');
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => el.classList.remove('show'), 4500);
}

function open(html) {
  modalContent.innerHTML = html;
  modal.showModal();
}

function close() {
  modal.close();
  modalContent.innerHTML = '';
}

function processImage(file, maxDim, quality, callback) {
  if (!file || !file.type.startsWith('image/')) {
    toast('Por favor, selecione um arquivo de imagem.');
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > h && w > maxDim) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else if (h > maxDim) {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', quality));
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function renderLogoPicker(currentLogo = '') {
  tempLogo = currentLogo || '';
  return `
    <label>Ícone / Logo da Empresa</label>
    <div class="logo-picker-box" id="logo-dropzone">
      <input type="file" id="logo-file-input" accept="image/*">
      <div class="logo-picker-content" id="logo-picker-content">
        ${tempLogo ? `
          <img src="${tempLogo}" class="logo-preview-thumb" alt="Prévia da logo">
          <span class="logo-picker-text">Clique para trocar a logo</span>
          <span class="logo-picker-sub">Sua marca aparecerá nos links dos passageiros</span>
          <button type="button" class="logo-clear-btn" data-action="clear-logo">Remover logo</button>
        ` : `
          <div class="logo-picker-icon">🏢</div>
          <span class="logo-picker-text">Clique para carregar a logo da sua empresa</span>
          <span class="logo-picker-sub">Formatos PNG, JPG ou SVG recomendados</span>
        `}
      </div>
    </div>
  `;
}

function renderTripPhotoSlots() {
  return `
    <label>Fotos do Destino (Até 3 fotos da viagem)</label>
    <p class="hint" style="margin-top:-3px;margin-bottom:8px;">Fotos reais atraem muito mais participantes. A primeira foto será a capa da viagem.</p>
    <div class="trip-photos-grid">
      ${[0, 1, 2].map(i => `
        <div class="photo-slot" data-index="${i}">
          <input type="file" class="trip-photo-input" data-index="${i}" accept="image/*">
          ${tempPhotos[i] ? `
            <img src="${tempPhotos[i]}" class="photo-slot-img" alt="Foto ${i + 1}">
            <span class="photo-slot-badge">${i === 0 ? 'Capa Principal' : 'Foto ' + (i + 1)}</span>
            <button type="button" class="photo-slot-remove" data-action="remove-photo" data-index="${i}" title="Remover foto">✕</button>
          ` : `
            <div class="photo-slot-icon">📷</div>
            <div class="photo-slot-text">${i === 0 ? '+ Foto Capa' : '+ Foto ' + (i + 1)}</div>
          `}
        </div>
      `).join('')}
    </div>
  `;
}

function setupTripPhotoEvents() {
  document.querySelectorAll('.trip-photo-input').forEach(input => {
    input.addEventListener('change', ev => {
      const idx = Number(ev.target.dataset.index);
      const file = ev.target.files[0];
      if (file) {
        processImage(file, 800, 0.85, compressed => {
          tempPhotos[idx] = compressed;
          const container = document.querySelector('#trip-photos-container');
          if (container) {
            container.innerHTML = renderTripPhotoSlots();
            setupTripPhotoEvents();
          }
        });
      }
    });
  });
}

function demoCard(t, i) {
  const companyName = t.company_name || 'Agência GuiaUp';
  const hasPhotos = Array.isArray(t.photos) && t.photos.length > 0;
  const datesText = t.date_return ? `${date(t.date)} até ${date(t.date_return)}` : date(t.date);

  return `
    <article class="trip-card ${t.demo ? 'demo' : ''}">
      <div class="trip-cover tone${i % 3}">
        ${hasPhotos ? `<img src="${t.photos[0]}" class="trip-cover-real" alt="${e(t.title)}">` : ''}
        <span>↗ ${e(t.destination)}</span>
        ${t.demo ? '<small class="preview-badge">Exemplo de viagem</small>' : ''}
      </div>
      <div class="card-body">
        <small style="color:var(--muted);font-weight:600;font-size:11px;">
          ${t.logo_data ? `<img src="${t.logo_data}" style="width:16px;height:16px;border-radius:4px;vertical-align:middle;margin-right:4px;">` : '🏢 '}${e(companyName)}
        </small>
        <h3 style="margin-top:4px;">${e(t.title)}</h3>
        <div class="card-meta">
          <span>◷ ${t.demo ? 'Próximas saídas' : datesText}</span>
          <span>♧ ${t.capacity - t.registered} vagas</span>
        </div>
        <p>${e(t.description.slice(0, 120))}</p>
        <div class="card-bottom">
          <div class="price">
            <small>Por pessoa</small>
            ${money(t.price)}
            ${t.installment_text ? `<span class="price-installments">${e(t.installment_text)}</span>` : ''}
          </div>
          ${t.demo ? '<span class="pill">Exemplo</span>' : button('join', 'Ver detalhes ↗', 'small outline', `data-id="${e(t.id)}"`)}
        </div>
      </div>
    </article>
  `;
}

function home() {
  const available = trips.filter(t => t.published);
  view = 'home';
  activeId = null;
  app.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <div class="eyebrow"><span class="dot"></span> A plataforma dos guias de turismo</div>
        <h1>Sua empresa conectada.<br>Seu grupo seguro.<br><em>Do embarque ao retorno.</em></h1>
        <p>Organize excursões com a sua própria marca, fotos dos destinos, valores à vista ou parcelados, cronômetro de paradas com alarme sonoro e lista de retorno em tempo real.</p>
        <div class="hero-actions">
          ${button('register-guide', 'Criar Conta da Empresa ↗', 'light')}
          ${button('explore', 'Ver viagens', 'outline')}
        </div>
        <div class="hero-note">
          <div class="avatar-stack"><i>7d</i><i>✓</i><i>↑</i></div>
          7 dias de teste grátis sem compromisso para você testar no celular.
        </div>
      </div>
      <div class="landscape" role="img" aria-label="Ilustração de uma estrada entre montanhas">
        <span class="scene-label">O CAMINHO COM A MARCA DA SUA EMPRESA</span>
        <div class="sun"></div>
        <div class="mountain back"></div>
        <div class="mountain"></div>
        <div class="mountain front"></div>
        <div class="road"></div>
        <div class="floating-card">
          <div class="timer-mini">15:00</div>
          <div>
            <strong>Contagem sincronizada para o grupo.</strong>
            <p>Seus passageiros recebem aviso sonoro na hora de voltar.</p>
          </div>
        </div>
      </div>
    </section>

    <div class="strip">
      <span><b>🏷️</b> Sua agência e fotos reais em destaque</span>
      <span><b>💳</b> Valores à vista e parcelado informados</span>
      <span><b>◷</b> Tempo de parada compartilhado no celular</span>
      <span><b>✓</b> Confirmação de retorno ao ônibus</span>
    </div>

    <!-- Seção de Planos e Monetização -->
    <section class="pricing-section" id="pricing">
      <div class="pricing-header">
        <div class="eyebrow" style="justify-content:center;">Monetização simples e acessível</div>
        <h2>Escolha o melhor plano para sua agência</h2>
        <p class="muted">Sem taxas por passageiro. Crie quantas viagens quiser com a marca da sua empresa.</p>
      </div>
      <div class="pricing-cards">
        <div class="pricing-card featured">
          <span class="pricing-badge">Mais Popular · 7 Dias Grátis</span>
          <h3>Plano Guia Pro Mensal</h3>
          <p class="muted">Ideal para guias autônomos e agências de turismo em expansão.</p>
          <div class="pricing-price">R$ 39,90 <span>/ mês</span></div>
          <small style="color:var(--muted)">Teste grátis por 7 dias. Cancele quando quiser.</small>
          <ul class="pricing-features">
            <li><b>✓</b> <strong>Nome e Logo da sua empresa</strong> nos links e telas dos passageiros</li>
            <li><b>✓</b> <strong>Fotos reais das viagens</strong> e opções de parcelamento</li>
            <li><b>✓</b> <strong>Viagens e Grupos ilimitados</strong> durante todo o mês</li>
            <li><b>✓</b> <strong>Cronômetro sincronizado</strong> com alerta sonoro nos celulares</li>
            <li><b>✓</b> <strong>Confirmação de retorno</strong> (quem já voltou ao ônibus)</li>
            <li><b>✓</b> <strong>Mural de avisos instantâneo</strong> para todo o grupo</li>
            <li><b>✓</b> <strong>Links individuais por passageiro</strong> válidos por 7 dias</li>
          </ul>
          ${button('register-guide', 'Começar 7 Dias Grátis ↗', 'button')}
        </div>

        <div class="pricing-card">
          <span class="pill" style="align-self:flex-start;margin-bottom:12px;">Economize 25%</span>
          <h3>Plano Anual Agência</h3>
          <p class="muted">Para empresas que realizam viagens o ano todo.</p>
          <div class="pricing-price">R$ 349,00 <span>/ ano</span></div>
          <small style="color:var(--muted)">Equivalente a apenas R$ 29,08 por mês.</small>
          <ul class="pricing-features">
            <li><b>✓</b> Todos os recursos do Plano Pro</li>
            <li><b>✓</b> Suporte prioritário via WhatsApp</li>
            <li><b>✓</b> Economia de mais de R$ 120 por ano</li>
            <li><b>✓</b> Acesso antecipado a novas funções</li>
          </ul>
          ${button('register-guide', 'Assinar Plano Anual ↗', 'outline')}
        </div>
      </div>
    </section>

    <section id="explore" style="margin-top:60px;">
      <div class="section-top">
        <div>
          <div class="eyebrow no-bottom">Viagens publicadas</div>
          <h2>Próximas saídas disponíveis</h2>
        </div>
        <span class="pill">${available.length} ${available.length === 1 ? 'viagem disponível' : 'viagens disponíveis'}</span>
      </div>
      <div class="grid">
        ${available.length ? available.map(demoCard).join('') : `
          <div class="empty">
            <h3>Nenhuma viagem pública no momento.</h3>
            <p>Cadastre a sua empresa e publique a primeira viagem com fotos para o seu grupo.</p>
            ${button('register-guide', 'Cadastrar Minha Agência ↗', 'small')}
          </div>
        `}
      </div>
    </section>
  `;
}

async function refreshMe() {
  me = await api('/me');
  offset = me.serverTime - Date.now();
  document.querySelector('#my-trip').hidden = me.role !== 'guest';
  const guideBtn = document.querySelector('#guide-button');
  if (me.role === 'guide') {
    guideBtn.textContent = 'Painel do guia ↗';
  } else {
    guideBtn.textContent = 'Área do guia ↗';
  }
}

async function loadTrips() {
  trips = await api('/trips');
}

function authModal(tab = 'register') {
  open(`
    <div class="tab-group">
      <button class="tab-btn ${tab === 'register' ? 'active' : ''}" data-action="tab-register">Cadastrar Empresa (7 dias grátis)</button>
      <button class="tab-btn ${tab === 'login' ? 'active' : ''}" data-action="tab-login">Já sou cadastrado (Entrar)</button>
    </div>

    ${tab === 'register' ? `
      <h2>Comece com 7 dias grátis</h2>
      <p class="muted">Cadastre seus dados e da sua agência. Você poderá testar tudo no celular sem pagar nada agora.</p>
      <form id="register-form">
        <label for="reg-company">Nome da Empresa / Agência</label>
        <input id="reg-company" name="companyName" placeholder="Ex: Trilhas & Rumos Ecoturismo" maxlength="100" required>

        <label for="reg-name">Nome do Responsável / Guia</label>
        <input id="reg-name" name="name" placeholder="Ex: Carlos Oliveira" maxlength="100" required>

        <div class="form-row">
          <div>
            <label for="reg-email">E-mail de acesso</label>
            <input id="reg-email" name="email" type="email" placeholder="seu@email.com" maxlength="120" required>
          </div>
          <div>
            <label for="reg-phone">WhatsApp / Telefone</label>
            <input id="reg-phone" name="phone" type="tel" placeholder="(11) 99999-9999" maxlength="30">
          </div>
        </div>

        <label for="reg-password">Crie uma senha (mínimo 8 dígitos)</label>
        <input id="reg-password" name="password" type="password" minlength="8" maxlength="128" placeholder="••••••••" required>

        ${renderLogoPicker()}

        ${button('submit', 'Criar Conta e Começar Teste Grátis ↗')}
      </form>
    ` : `
      <h2>Entrar no Painel do Guia</h2>
      <p class="muted">Acesse suas viagens, grupos e paradas.</p>
      <form id="login-form">
        <label for="login-email">E-mail</label>
        <input id="login-email" name="email" type="email" placeholder="seu@email.com" required>

        <label for="login-password">Senha</label>
        <input id="login-password" name="password" type="password" placeholder="••••••••" required>

        ${button('submit', 'Entrar no painel ↗')}
      </form>
    `}
  `);

  setupLogoEvents();
}

function setupLogoEvents() {
  const fileInput = document.querySelector('#logo-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', ev => {
      const file = ev.target.files[0];
      if (file) {
        processImage(file, 300, 0.9, compressedBase64 => {
          tempLogo = compressedBase64;
          const container = document.querySelector('#logo-picker-content');
          if (container) {
            container.innerHTML = `
              <img src="${tempLogo}" class="logo-preview-thumb" alt="Prévia da logo">
              <span class="logo-picker-text">Logo carregada com sucesso!</span>
              <span class="logo-picker-sub">Toque para escolher outra se desejar</span>
              <button type="button" class="logo-clear-btn" data-action="clear-logo">Remover logo</button>
            `;
          }
        });
      }
    });
  }
}

function companyProfileModal() {
  const g = me.guide || {};
  tempLogo = g.logo_data || '';
  open(`
    <h2>Dados da Empresa & Marca</h2>
    <p class="muted">Esses dados e a logo aparecem nos links e telas que os passageiros acessam.</p>
    <form id="company-profile-form">
      <label for="edit-company">Nome da Empresa / Agência</label>
      <input id="edit-company" name="companyName" value="${e(g.company_name || '')}" maxlength="100" required>

      <label for="edit-name">Nome do Responsável / Guia</label>
      <input id="edit-name" name="name" value="${e(g.name || '')}" maxlength="100" required>

      <label for="edit-phone">Telefone / WhatsApp</label>
      <input id="edit-phone" name="phone" value="${e(g.phone || '')}" maxlength="30">

      ${renderLogoPicker(tempLogo)}

      ${button('submit', 'Salvar Alterações ↗')}
    </form>
  `);
  setupLogoEvents();
}

function subscribeModal() {
  open(`
    <h2>Ativar Plano Guia Pro</h2>
    <p class="muted">Libere viagens ilimitadas e a marca da sua empresa nos celulares de todo o grupo.</p>
    <div class="pricing-card featured" style="margin:20px 0;">
      <span class="pricing-badge">Acesso Completo</span>
      <h3>Assinatura Guia Pro</h3>
      <div class="pricing-price">R$ 39,90 <span>/ mês</span></div>
      <p style="font-size:13px;color:var(--muted);">Cobrança mensal automática no cartão ou Pix recorrente.</p>
      <ul class="pricing-features">
        <li><b>✓</b> Sua Logo e Nome da Agência em todas as viagens</li>
        <li><b>✓</b> Até 3 fotos reais do destino e valores parcelados</li>
        <li><b>✓</b> Viagens e participantes ilimitados</li>
        <li><b>✓</b> Cronômetro com alarme sincronizado</li>
      </ul>
      <div style="background:#f1f5eb;border-radius:10px;padding:14px;margin-bottom:15px;font-size:13px;">
        <strong>Integração com Asaas / Stripe / Pix:</strong><br>
        Clique no botão abaixo para ativar a assinatura do seu painel.
      </div>
      ${button('confirm-subscribe', 'Confirmar e Ativar Plano Pro (R$ 39,90) ↗')}
    </div>
  `);
}

async function guide() {
  if (me.role !== 'guide') {
    authModal('register');
    return;
  }
  view = 'guide';
  activeId = null;
  await loadTrips();
  const g = me.guide || {};
  const isTrial = g.subscription_status === 'trial';
  const isActive = g.subscription_status === 'active';
  const daysLeft = g.trial_days_left ?? 0;

  app.innerHTML = `
    <!-- Perfil da Empresa e Status de Assinatura -->
    <div class="guide-profile-badge">
      ${g.logo_data ? `<img src="${g.logo_data}" class="company-logo-img" alt="Logo">` : `<div class="company-logo-fallback">${e((g.company_name || 'G').slice(0, 2).toUpperCase())}</div>`}
      <div class="company-badge-info">
        <strong>${e(g.company_name || 'Sua Agência')}</strong>
        <small>Responsável: ${e(g.name || 'Guia')} · ${g.phone ? e(g.phone) : 'Sem telefone'}</small>
      </div>
      <div>
        ${isTrial ? `<span class="subscription-pill trial">⏰ Teste Grátis: ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'} restantes</span>` : ''}
        ${isActive ? `<span class="subscription-pill active">✓ Plano Pro Ativo</span>` : ''}
        ${!isTrial && !isActive ? `<span class="subscription-pill expired">⚠ Teste Expirado</span>` : ''}
      </div>
    </div>

    <div class="page-heading">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div>
          <div class="eyebrow no-bottom">Painel de Controle</div>
          <h1>Suas Viagens e Grupos</h1>
        </div>
        <div style="display:flex;gap:8px;">
          ${button('company-profile', '⚙️ Dados da Empresa & Logo', 'small outline')}
          ${!isActive ? button('subscribe', '⭐ Assinar Plano Pro', 'small light') : ''}
        </div>
      </div>
    </div>

    <div class="banner">
      <div>
        <h2>Crie sua próxima excursão.</h2>
        <p>Defina o destino, datas, valores à vista ou parcelado e adicione até 3 fotos do lugar.</p>
      </div>
      ${button('new-trip', '+ Nova viagem', 'light')}
    </div>

    <div class="stats">
      <div class="stat"><b>${trips.length}</b><span>Viagens criadas</span></div>
      <div class="stat"><b>${trips.reduce((a, t) => a + t.registered, 0)}</b><span>Participantes</span></div>
      <div class="stat"><b>${trips.filter(t => t.published).length}</b><span>Viagens publicadas</span></div>
    </div>

    <div class="panel-title">
      <h2>Viagens da Agência</h2>
      ${button('logout', 'Sair da conta', 'small outline')}
    </div>

    ${trips.length ? trips.map(t => {
      const datesText = t.date_return ? `${date(t.date)} até ${date(t.date_return)}` : date(t.date);
      const photoCount = Array.isArray(t.photos) ? t.photos.length : 0;
      return `
        <article class="guide-trip">
          <div>
            <span class="pill">${t.published ? 'Publicada' : 'Rascunho'}</span>
            ${photoCount > 0 ? `<span class="pill" style="margin-left:4px;">📷 ${photoCount} ${photoCount === 1 ? 'foto' : 'fotos'}</span>` : ''}
            <h3 class="spaced-title">${e(t.title)}</h3>
            <p>${e(t.destination)} · ${datesText} · ${money(t.price)} ${t.installment_text ? `(${e(t.installment_text)})` : ''} · ${t.registered}/${t.capacity} inscritos</p>
          </div>
          <div class="guide-trip-actions">
            ${button('edit-trip', 'Editar', 'small outline', `data-id="${t.id}"`)}
            ${button('manage', 'Acompanhar grupo ↗', 'small', `data-id="${t.id}"`)}
          </div>
        </article>
      `;
    }).join('') : `
      <div class="empty">
        <h3>Sua primeira viagem está a um clique.</h3>
        <p>Inclua destino, fotos, datas e valores. A viagem aparece com a marca da sua empresa.</p>
        ${button('new-trip', '+ Criar primeira viagem', 'small')}
      </div>
    `}
  `;
}

function tripForm(t = {}) {
  tempPhotos = ['', '', ''];
  if (Array.isArray(t.photos)) {
    t.photos.slice(0, 3).forEach((p, idx) => { tempPhotos[idx] = p; });
  }

  open(`
    <div class="eyebrow">Organize o próximo encontro</div>
    <h2>${t.id ? 'Editar viagem' : 'Nova viagem'}</h2>
    <form id="trip-form" data-id="${e(t.id || '')}">
      <label for="title">Nome da viagem</label>
      <input id="title" name="title" value="${e(t.title || '')}" placeholder="Ex: Um fim de semana na Chapada" maxlength="100" required>

      <label for="destination">Destino</label>
      <input id="destination" name="destination" value="${e(t.destination || '')}" placeholder="Cidade / Estado" maxlength="100" required>

      <div class="form-row">
        <div>
          <label for="date">Data de saída / início</label>
          <input id="date" name="date" type="date" value="${e(t.date || '')}" required>
        </div>
        <div>
          <label for="date_return">Data de retorno (opcional)</label>
          <input id="date_return" name="date_return" type="date" value="${e(t.date_return || '')}">
        </div>
      </div>

      <div class="form-row">
        <div>
          <label for="price">Valor à vista por pessoa (R$)</label>
          <input id="price" name="price" type="number" min="0" step="0.01" value="${t.price ?? ''}" placeholder="Ex: 350.00" required>
        </div>
        <div>
          <label for="installment_text">Opção de parcelamento</label>
          <input id="installment_text" name="installment_text" value="${e(t.installment_text || '')}" placeholder="Ex: ou 3x de R$ 125 no cartão" maxlength="150">
        </div>
      </div>

      <div class="form-row">
        <div>
          <label for="capacity">Número de vagas</label>
          <input id="capacity" name="capacity" type="number" min="1" max="500" value="${t.capacity || 30}" required>
        </div>
        <div>
          <label for="meeting">Ponto de encontro e embarque</label>
          <input id="meeting" name="meeting" value="${e(t.meeting || '')}" maxlength="300" placeholder="Ex: Metrô Tietê às 07h00" required>
        </div>
      </div>

      <label for="description">O que vamos viver? (Roteiro e detalhes)</label>
      <textarea id="description" name="description" maxlength="2000" placeholder="Descreva os passeios inclusos, o que levar e informações importantes..." required>${e(t.description || '')}</textarea>

      <!-- 3 Slots de Fotos do Destino -->
      <div id="trip-photos-container">
        ${renderTripPhotoSlots()}
      </div>

      <label class="checkbox" style="margin-top:15px;">
        <input type="checkbox" name="published" ${t.published !== 0 ? 'checked' : ''}>
        Publicar na página de viagens da agência
      </label>

      ${button('submit', 'Salvar viagem ↗')}
    </form>
  `);

  setupTripPhotoEvents();
}

function join(id) {
  const t = trips.find(t => t.id === id);
  if (!t) return;
  if (me.role === 'guest') {
    if (me.participant.trip_id === id) {
      traveler();
      return;
    }
    toast('Você já está inscrito em outra viagem neste navegador.');
    return;
  }

  const hasPhotos = Array.isArray(t.photos) && t.photos.length > 0;
  const datesText = t.date_return ? `${date(t.date)} até ${date(t.date_return)}` : date(t.date);

  open(`
    <div class="eyebrow">Sua próxima história</div>
    <h2>${e(t.title)}</h2>

    <!-- Galeria de Fotos do Destino -->
    ${hasPhotos ? `
      <div class="trip-gallery-view">
        ${t.photos.map(p => `<img src="${p}" alt="Foto do local">`).join('')}
      </div>
    ` : ''}

    <p style="white-space:pre-wrap;">${e(t.description)}</p>

    <div class="notice">
      📍 <strong>Destino:</strong> ${e(t.destination)}<br>
      📅 <strong>Data:</strong> ${datesText}<br>
      💵 <strong>Valor à vista:</strong> <span style="font-size:16px;font-weight:700;color:var(--green);">${money(t.price)}</span>
      ${t.installment_text ? `<br>💳 <strong>Parcelamento:</strong> ${e(t.installment_text)}` : ''}<br>
      🚌 <strong>Ponto de encontro:</strong> ${e(t.meeting)}
    </div>

    <form id="join-form" data-id="${t.id}">
      <label for="name">Seu nome</label>
      <input id="name" name="name" maxlength="100" autocomplete="name" placeholder="Nome e sobrenome" required>

      <label for="phone">Telefone / WhatsApp (opcional)</label>
      <input id="phone" name="phone" type="tel" maxlength="30" autocomplete="tel" placeholder="(11) 99999-9999">

      ${button('submit', t.registered >= t.capacity ? 'Viagem lotada' : 'Quero participar ↗', '', t.registered >= t.capacity ? 'disabled' : '')}
    </form>
  `);
}

function timerPanel() {
  return `
    <section class="panel timer-panel">
      <span class="pill" id="stop-badge">Aguardando parada</span>
      <div class="timer-label" id="stop-label">Seu grupo no mesmo tempo.</div>
      <div class="timer" id="timer" aria-label="Tempo restante">--:--</div>
      <div class="progress"><span id="progress"></span></div>
      <p id="timer-note" class="hint">Quando o guia iniciar uma parada, a contagem aparece aqui.</p>
      <div class="controls">
        ${button('sound', sound ? 'Som ativado ✓' : 'Ativar som do alerta', 'small outline', `id="sound-button"`)}
        ${view === 'traveler' ? button('return', 'Já voltei ao ônibus ✓', 'small', `id="return-button"`) : button('cancel-stop', 'Encerrar parada', 'small outline')}
      </div>
      <p class="hint">Mantenha esta página aberta e a tela ativa para ouvir o bip.</p>
      <div id="connection" class="status-line" aria-live="polite">Conectando ao grupo…</div>
    </section>
  `;
}

async function manage(id) {
  view = 'manage';
  activeId = id;
  state = null;
  participants = [];
  app.innerHTML = `
    ${button('guide', '← Suas viagens', 'outline small')}
    <div class="page-heading">
      <div class="eyebrow">Acompanhamento do grupo</div>
      <h1 id="trip-heading">Carregando viagem…</h1>
      <p id="trip-meta" class="muted"></p>
    </div>
    <div class="workspace">
      <div>
        ${timerPanel()}
        <section class="panel">
          <h3>Hora de uma pausa</h3>
          <form id="stop-form">
            <label for="label">Local ou motivo da parada</label>
            <input id="label" name="label" value="Parada para descanso" maxlength="200" required>
            <div class="form-row">
              <div>
                <label for="minutes">Minutos</label>
                <input id="minutes" name="minutes" type="number" min="0" max="240" value="15" required>
              </div>
              <div>
                <label for="seconds">Segundos</label>
                <input id="seconds" name="seconds" type="number" min="0" max="59" value="0" required>
              </div>
            </div>
            <p class="hint">Ao iniciar, o tempo aparece em todos os celulares conectados.</p>
            ${button('submit', 'Iniciar contagem para o grupo ↗')}
          </form>
        </section>
        <section class="panel">
          <h3>Convide seu grupo</h3>
          <p class="hint">Compartilhe o link da viagem com os passageiros.</p>
          <div class="link-box">
            <input aria-label="Link de inscrição" id="invite-link" readonly value="${e(location.origin + '/?trip=' + id)}">
            ${button('copy', 'Copiar link', 'small outline')}
          </div>
        </section>
      </div>
      <div>
        <section class="panel">
          <div class="panel-title">
            <h3>Participantes <span class="pill" id="count">0</span></h3>
            ${button('add-person', '+ Cadastrar', 'small outline')}
          </div>
          <div id="people"></div>
        </section>
        <section class="panel">
          <h3>Aviso para todos</h3>
          <form id="message-form">
            <label for="text">Mensagem do guia</label>
            <textarea id="text" name="text" placeholder="Pessoal, nosso ponto de encontro é ao lado do ônibus." maxlength="1000" required></textarea>
            ${button('submit', 'Enviar aviso ↗')}
          </form>
          <div id="messages"></div>
        </section>
      </div>
    </div>
  `;
  await sync();
}

async function traveler() {
  if (me.role !== 'guest') {
    toast('Cadastre-se na viagem para acompanhar.');
    home();
    return;
  }
  view = 'traveler';
  activeId = me.participant.trip_id;
  state = null;

  app.innerHTML = `
    <!-- Banner com a Marca da Empresa Organizadora -->
    <div id="traveler-company-header"></div>

    <div class="banner">
      <div>
        <div class="eyebrow">Bom caminho, ${e(me.participant.name.split(' ')[0])}</div>
        <h2 id="trip-heading">Sua viagem</h2>
        <p id="trip-meta"></p>
      </div>
      <span class="pill">Você faz parte do grupo</span>
    </div>

    <div class="workspace">
      <div>
        ${timerPanel()}
        <section class="panel">
          <h3>Nosso ponto de encontro</h3>
          <p id="meeting"></p>
        </section>
      </div>
      <section class="panel">
        <div class="panel-title">
          <h3>Avisos do guia</h3>
          <span class="pill">Para todo o grupo</span>
        </div>
        <div id="messages"></div>
      </section>
    </div>

    <div class="spaced-block">
      ${button('logout', 'Sair deste acesso', 'small outline')}
    </div>
  `;
  await sync();
}

function drawMessages() {
  const el = document.querySelector('#messages');
  if (el) {
    el.innerHTML = state.messages.length ? state.messages.map(m => `
      <article class="message">
        <time>${new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · Guia da viagem</time>
        <p>${e(m.text)}</p>
      </article>
    `).join('') : '<p class="hint">Ainda não há avisos. As próximas mensagens aparecem aqui.</p>';
  }
}

function drawPeople() {
  const el = document.querySelector('#people');
  if (!el) return;
  document.querySelector('#count').textContent = participants.length;
  el.innerHTML = participants.length ? participants.map(p => `
    <div class="person">
      <div class="person-avatar">${e(p.name.slice(0, 2).toUpperCase())}</div>
      <div class="person-main">
        <strong>${e(p.name)}</strong>
        <small>${e(p.phone || 'Sem telefone informado')}</small>
      </div>
      <button class="presence" data-action="person-link" data-id="${p.id}">Acesso</button>
      <button class="presence ${p.present ? 'yes' : ''}" data-action="presence" data-id="${p.id}" data-present="${p.present ? 0 : 1}">
        ${p.present ? '✓ No ônibus' : 'Confirmar volta'}
      </button>
    </div>
  `).join('') : '<p class="hint">Compartilhe o link da viagem ou cadastre participantes aqui.</p>';
}

async function sync() {
  if (!activeId || polling) return;
  const id = activeId;
  polling = true;
  try {
    const started = Date.now(), v = await api('/trips/' + id + '/state');
    if (activeId !== id) return;
    state = v;
    offset = v.serverTime - (started + Date.now()) / 2;
    connected = true;
    lastSync = Date.now();

    document.querySelector('#trip-heading').textContent = v.trip.title;
    const datesText = v.trip.date_return ? `${date(v.trip.date)} até ${date(v.trip.date_return)}` : date(v.trip.date);
    document.querySelector('#trip-meta').textContent = `${v.trip.destination} · ${datesText} · ${v.trip.registered} participantes`;

    if (view === 'traveler') {
      document.querySelector('#meeting').textContent = v.trip.meeting;
      const compHeader = document.querySelector('#traveler-company-header');
      if (compHeader && v.company) {
        compHeader.innerHTML = `
          <div class="company-banner-header">
            ${v.company.logo ? `<img src="${v.company.logo}" class="company-logo-img" alt="Logo">` : `<div class="company-logo-fallback">🏢</div>`}
            <div>
              <strong style="font-size:16px;">${e(v.company.name)}</strong>
              <small style="display:block;color:var(--muted)">Viagem organizada por ${e(v.company.guide_name || 'Guia')}</small>
            </div>
          </div>
        `;
      }
    }

    drawMessages();

    if (view === 'manage') {
      participants = await api('/trips/' + id + '/participants');
      if (activeId === id) drawPeople();
    }

    if (view === 'traveler') {
      const current = await api('/me');
      if (activeId !== id) return;
      me = current;
      const b = document.querySelector('#return-button');
      if (b) b.textContent = me.participant.present ? 'Retorno confirmado ✓' : 'Já voltei ao ônibus ✓';
    }

    tick();
  } catch (err) {
    connected = false;
    tick();
  } finally {
    polling = false;
  }
}

function beep() {
  if (!sound || !audio) return;
  audio.resume().then(() => {
    for (let i = 0; i < 3; i++) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(.0001, audio.currentTime + i * .4);
      gain.gain.exponentialRampToValueAtTime(.22, audio.currentTime + i * .4 + .03);
      gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + i * .4 + .25);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(audio.currentTime + i * .4);
      osc.stop(audio.currentTime + i * .4 + .28);
    }
  }).catch(() => toast('Toque em Ativar som novamente.'));
}

function tick() {
  const el = document.querySelector('#timer');
  if (!el) return;
  const c = document.querySelector('#connection');
  c.textContent = connected ? `Conectado · atualizado há ${Math.round((Date.now() - lastSync) / 1000)}s` : 'Sem conexão · aguardando reconexão';
  c.classList.toggle('error', !connected);

  const stop = state?.stop;
  if (!stop || stop.cancelled) {
    el.textContent = '--:--';
    el.classList.remove('expired');
    document.querySelector('#stop-badge').textContent = stop?.cancelled ? 'Parada encerrada' : 'Aguardando parada';
    document.querySelector('#progress').style.width = '0%';
    document.querySelector('#timer-note').textContent = stop?.cancelled ? 'O guia encerrou esta parada.' : 'Quando o guia iniciar, a contagem aparece aqui.';
    return;
  }

  const remaining = Math.max(0, Math.ceil((stop.ends_at - Date.now() - offset) / 1000));
  el.textContent = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
  el.classList.toggle('expired', !remaining);
  document.querySelector('#stop-label').textContent = stop.label;
  document.querySelector('#stop-badge').textContent = remaining ? 'Parada em andamento' : 'Hora de voltar';
  document.querySelector('#progress').style.width = Math.min(100, (remaining / stop.duration) * 100) + '%';
  document.querySelector('#timer-note').textContent = remaining ? 'Aproveite a pausa e volte antes de o tempo acabar.' : 'A parada terminou. Retorne ao ponto de encontro.';

  if (!remaining && alarmId !== stop.id) {
    alarmId = stop.id;
    const key = 'guiaup-alarm-' + stop.id;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      beep();
      toast('A parada terminou. Hora de voltar!');
    }
  }
}

document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const a = b.dataset.action;

  try {
    if (a === 'submit') return;
    if (a === 'close') close();
    else if (a === 'home') { await loadTrips(); home(); }
    else if (a === 'plans-nav' || a === 'plans') {
      if (view !== 'home') home();
      document.querySelector('#pricing')?.scrollIntoView({ behavior: 'smooth' });
    }
    else if (a === 'explore') document.querySelector('#explore')?.scrollIntoView({ behavior: 'smooth' });
    else if (a === 'guide') await guide();
    else if (a === 'register-guide') authModal('register');
    else if (a === 'tab-register') authModal('register');
    else if (a === 'tab-login') authModal('login');
    else if (a === 'company-profile') companyProfileModal();
    else if (a === 'subscribe') subscribeModal();
    else if (a === 'confirm-subscribe') {
      const res = await api('/guide/subscription', 'POST', {});
      toast(res.message || 'Plano Pro ativado!');
      close();
      await refreshMe();
      await guide();
    }
    else if (a === 'clear-logo') {
      tempLogo = '';
      const container = document.querySelector('#logo-picker-content');
      if (container) {
        container.innerHTML = `
          <div class="logo-picker-icon">🏢</div>
          <span class="logo-picker-text">Clique para carregar a logo da sua empresa</span>
          <span class="logo-picker-sub">Formatos PNG, JPG ou SVG recomendados</span>
        `;
      }
    }
    else if (a === 'remove-photo') {
      const idx = Number(b.dataset.index);
      tempPhotos[idx] = '';
      const container = document.querySelector('#trip-photos-container');
      if (container) {
        container.innerHTML = renderTripPhotoSlots();
        setupTripPhotoEvents();
      }
    }
    else if (a === 'traveler') await traveler();
    else if (a === 'new-trip') tripForm();
    else if (a === 'edit-trip') tripForm(trips.find(t => t.id === b.dataset.id));
    else if (a === 'join') join(b.dataset.id);
    else if (a === 'manage') await manage(b.dataset.id);
    else if (a === 'logout') {
      await api('/logout', 'POST', {});
      await refreshMe();
      await loadTrips();
      home();
    }
    else if (a === 'sound') {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      await audio.resume();
      sound = true;
      b.textContent = 'Som ativado ✓';
      beep();
      toast('Som habilitado. Mantenha a tela ativa durante a parada.');
    }
    else if (a === 'copy') {
      const v = document.querySelector('#invite-link');
      try {
        await navigator.clipboard.writeText(v.value);
        toast('Link copiado.');
      } catch {
        v.select();
        toast('Selecione e copie o link acima.');
      }
    }
    else if (a === 'cancel-stop') {
      await api('/trips/' + activeId + '/stop', 'POST', { cancel: true });
      await sync();
    }
    else if (a === 'return') {
      await api('/trips/' + activeId + '/presence', 'POST', { id: me.participant.id, present: true });
      toast('O guia recebeu sua confirmação.');
      await sync();
    }
    else if (a === 'presence') {
      await api('/trips/' + activeId + '/presence', 'POST', { id: b.dataset.id, present: b.dataset.present === '1' });
      await sync();
    }
    else if (a === 'person-link') {
      const v = await api('/trips/' + activeId + '/access', 'POST', { id: b.dataset.id });
      const link = location.origin + '/?access=' + v.token;
      open(`
        <h2>Acesso individual</h2>
        <p>Envie este link somente para esta pessoa. Ele permite acompanhar a viagem sem refazer o cadastro. Válido por 7 dias.</p>
        <div class="link-box">
          <input aria-label="Link individual" id="invite-link" readonly value="${e(link)}">
          ${button('copy', 'Copiar', 'small outline')}
        </div>
      `);
    }
    else if (a === 'add-person') {
      open(`
        <h2>Cadastrar participante</h2>
        <p>Inclua uma pessoa na lista do guia.</p>
        <form id="person-form">
          <label for="name">Nome</label>
          <input id="name" name="name" maxlength="100" required>
          <label for="phone">Telefone (opcional)</label>
          <input id="phone" name="phone" type="tel" maxlength="30">
          ${button('submit', 'Cadastrar participante ↗')}
        </form>
      `);
    }
  } catch (err) {
    toast(err.message);
  }
});

document.addEventListener('submit', async ev => {
  ev.preventDefault();
  const form = ev.target;
  const b = form.querySelector('button[type="submit"],button[data-action="submit"]');
  const data = Object.fromEntries(new FormData(form));
  if (b) b.disabled = true;

  try {
    if (form.id === 'register-form') {
      data.logoData = tempLogo;
      await api('/register', 'POST', data);
      close();
      toast('Conta criada com sucesso! 7 dias grátis ativados.');
      await refreshMe();
      await guide();
    }
    else if (form.id === 'login-form') {
      await api('/login', 'POST', data);
      close();
      toast('Bem-vindo de volta!');
      await refreshMe();
      await guide();
    }
    else if (form.id === 'company-profile-form') {
      data.logoData = tempLogo;
      await api('/guide/profile', 'PATCH', data);
      close();
      toast('Dados da empresa atualizados!');
      await refreshMe();
      await guide();
    }
    else if (form.id === 'trip-form') {
      data.published = form.elements.published.checked;
      data.photos = tempPhotos.filter(p => Boolean(p));
      await api('/trips' + (form.dataset.id ? '/' + form.dataset.id : ''), form.dataset.id ? 'PATCH' : 'POST', data);
      close();
      toast('Viagem salva com sucesso!');
      await guide();
    }
    else if (form.id === 'join-form') {
      data.tripId = form.dataset.id;
      await api('/join', 'POST', data);
      close();
      await refreshMe();
      await traveler();
    }
    else if (form.id === 'stop-form') {
      await api('/trips/' + activeId + '/stop', 'POST', {
        label: data.label,
        seconds: Number(data.minutes) * 60 + Number(data.seconds)
      });
      toast('Parada iniciada para o grupo.');
      await sync();
    }
    else if (form.id === 'message-form') {
      await api('/trips/' + activeId + '/messages', 'POST', { text: data.text });
      form.reset();
      toast('Aviso enviado.');
      await sync();
    }
    else if (form.id === 'person-form') {
      await api('/trips/' + activeId + '/participants', 'POST', data);
      close();
      toast('Participante cadastrado.');
      await sync();
    }
  } catch (err) {
    toast(err.message);
  } finally {
    if (b) b.disabled = false;
  }
});

setInterval(sync, 2000);
setInterval(tick, 250);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) sync();
});

(async () => {
  try {
    await refreshMe();
    const access = new URLSearchParams(location.search).get('access');
    if (access) {
      await api('/access', 'POST', { token: access });
      history.replaceState({}, '', location.pathname);
      await refreshMe();
    }
    await loadTrips();
    if (me.role === 'guest') {
      await traveler();
    } else {
      home();
      const id = new URLSearchParams(location.search).get('trip');
      if (id && trips.some(t => t.id === id)) join(id);
    }
  } catch (err) {
    app.innerHTML = '<div class="empty"><h2>Não foi possível conectar.</h2><p>Confira se o servidor GuiaUp está em execução e recarregue a página.</p></div>';
  }
})();
