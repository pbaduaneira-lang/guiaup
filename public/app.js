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
let guideTab = 'groups';
let presenceFilter = 'all';
let clients = [];
let clientSearch = '';

const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = v => {
  if (!v) return '';
  return new Date(v + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};
const button = (action, label, cls = '', extra = '') => `<button class="button ${cls}" data-action="${action}" ${extra}>${label}</button>`;

async function loadClients() {
  if (me.role !== 'guide') return [];
  try {
    clients = await api('/clients');
    return clients;
  } catch {
    clients = [];
    return [];
  }
}

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
  if (!modal.open) {
    modal.showModal();
  }
  modal.scrollTop = 0;
  document.body.classList.add('modal-open');
}

function close() {
  if (modal.open) {
    modal.close();
  }
  modalContent.innerHTML = '';
  document.body.classList.remove('modal-open');
}

modal.addEventListener('close', () => {
  document.body.classList.remove('modal-open');
});

modal.addEventListener('click', ev => {
  const rect = modal.getBoundingClientRect();
  const isInDialog = (
    rect.top <= ev.clientY && ev.clientY <= rect.top + rect.height &&
    rect.left <= ev.clientX && ev.clientX <= rect.left + rect.width
  );
  if (!isInDialog) {
    close();
  }
});

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
  await loadClients();
  const g = me.guide || {};
  const isTrial = g.subscription_status === 'trial';
  const isActive = g.subscription_status === 'active';
  const daysLeft = g.trial_days_left ?? 0;

  // Separação das duas atividades: Grupos em Operação vs Expositor de Vendas
  const groupTrips = trips.filter(t => t.trip_type === 'group' || (!t.trip_type && !t.published) || (!t.trip_type && t.registered > 0));
  const showcaseTrips = trips.filter(t => t.trip_type === 'showcase' || t.published === 1);

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
          <div class="eyebrow no-bottom">Painel do Guia</div>
          <h1>Central de Operações & Vendas</h1>
        </div>
        <div style="display:flex;gap:8px;">
          ${button('company-profile', '⚙️ Dados da Empresa & Logo', 'small outline')}
          ${!isActive ? button('subscribe', '⭐ Assinar Plano Pro', 'small light') : ''}
        </div>
      </div>
    </div>

    <!-- HUB DAS DUAS ATIVIDADES DO GUIA -->
    <div class="guide-action-hub">
      <div class="guide-hub-card hub-sold">
        <div class="hub-card-header">
          <div class="hub-icon">🚌</div>
          <div class="hub-card-body">
            <span class="hub-badge">Operação & Campo</span>
            <h3>Cadastrar Viagem Já Vendida</h3>
            <p>Grupo fechado? Cadastre o roteiro, adicione seus passageiros e envie o link de WhatsApp para controle de embarque e paradas no ônibus.</p>
          </div>
        </div>
        <div class="hub-card-footer">
          <small style="color:#d5e5db;">Sem cobrança · Paradas · WhatsApp</small>
          ${button('new-sold-trip', '+ Viagem Vendida (Grupo)', 'light small')}
        </div>
      </div>

      <div class="guide-hub-card hub-showcase">
        <div class="hub-card-header">
          <div class="hub-icon">📢</div>
          <div class="hub-card-body">
            <span class="hub-badge">Vitrine Comercial</span>
            <h3>Publicar para Venda (Expositor)</h3>
            <p>Quer vender mais? Exponha suas próximas excursões com fotos reais, datas, valores e opções de parcelamento para novos clientes no app.</p>
          </div>
        </div>
        <div class="hub-card-footer">
          <small style="color:var(--muted);">Fotos reais · Parcelamento · Visível no app</small>
          ${button('new-showcase-trip', '+ Publicar para Venda', 'small')}
        </div>
      </div>
    </div>

    <!-- Estatísticas Gerais -->
    <div class="stats">
      <div class="stat"><b>${groupTrips.length}</b><span>Grupos em Operação</span></div>
      <div class="stat"><b>${showcaseTrips.length}</b><span>Viagens no Expositor</span></div>
      <div class="stat"><b>${clients.length}</b><span>Carteira de Clientes</span></div>
    </div>

    <!-- Abas de Navegação -->
    <div class="guide-tabs">
      <button class="guide-tab-btn ${guideTab === 'groups' ? 'active' : ''}" data-action="tab-guide-groups">
        🚌 Grupos em Operação <span class="guide-tab-badge">${groupTrips.length}</span>
      </button>
      <button class="guide-tab-btn ${guideTab === 'showcase' ? 'active' : ''}" data-action="tab-guide-showcase">
        📢 Expositor de Vendas <span class="guide-tab-badge">${showcaseTrips.length}</span>
      </button>
      <button class="guide-tab-btn ${guideTab === 'clients' ? 'active' : ''}" data-action="tab-guide-clients">
        👥 Carteira de Clientes <span class="guide-tab-badge">${clients.length}</span>
      </button>
      <div style="margin-left:auto;">
        ${button('logout', 'Sair da conta', 'small outline')}
      </div>
    </div>

    <!-- CONTEÚDO DA ABA SELECIONADA -->
    ${guideTab === 'groups' ? `
      ${groupTrips.length ? groupTrips.map(t => {
        const datesText = t.date_return ? `${date(t.date)} até ${date(t.date_return)}` : date(t.date);
        return `
          <article class="guide-trip">
            <div style="flex:1;">
              <span class="pill" style="background:#e3f1e5;color:#205e26;">🚌 Grupo Fechado / Operação</span>
              <span class="pill" style="margin-left:4px;">👥 ${t.registered}/${t.capacity} passageiros</span>
              <h3 class="spaced-title">${e(t.title)}</h3>
              <p>📍 ${e(t.destination)} · 📅 ${datesText} · 🚩 Ponto: ${e(t.meeting)}</p>
            </div>
            <div class="guide-trip-actions">
              ${button('share-group-wa', '📲 Link no WhatsApp', 'small btn-whatsapp', `data-id="${t.id}" data-title="${e(t.title)}"`)}
              ${button('manage', '🚌 Painel do Ônibus (Chamada & Paradas) ↗', 'small', `data-id="${t.id}"`)}
              ${button('edit-trip', 'Editar', 'small outline', `data-id="${t.id}" data-type="group"`)}
            </div>
          </article>
        `;
      }).join('') : `
        <div class="empty">
          <h3>Nenhum grupo em operação no momento.</h3>
          <p>Já tem uma viagem com passageiros confirmados? Cadastre para gerenciar o embarque, a chamada e as paradas do ônibus.</p>
          <div style="margin-top:14px;">
            ${button('new-sold-trip', '+ Cadastrar Viagem Já Vendida', 'small')}
          </div>
        </div>
      `}
    ` : (guideTab === 'showcase' ? `
      ${showcaseTrips.length ? showcaseTrips.map(t => {
        const datesText = t.date_return ? `${date(t.date)} até ${date(t.date_return)}` : date(t.date);
        const photoCount = Array.isArray(t.photos) ? t.photos.length : 0;
        return `
          <article class="guide-trip">
            <div style="flex:1;">
              <span class="pill" style="background:#eef6e8;color:#2b6630;">${t.published ? '🟢 Ativa na Vitrine do App' : '⏸️ Pausada no Expositor'}</span>
              ${photoCount > 0 ? `<span class="pill" style="margin-left:4px;">📷 ${photoCount} ${photoCount === 1 ? 'foto' : 'fotos'}</span>` : ''}
              <h3 class="spaced-title">${e(t.title)}</h3>
              <p>📍 ${e(t.destination)} · 📅 ${datesText} · 💰 ${money(t.price)} ${t.installment_text ? `(${e(t.installment_text)})` : ''} · ${t.registered}/${t.capacity} vagas reservadas</p>
            </div>
            <div class="guide-trip-actions">
              ${button('edit-trip', 'Editar Anúncio & Fotos', 'small outline', `data-id="${t.id}" data-type="showcase"`)}
              ${button('manage', 'Acompanhar Grupo ↗', 'small', `data-id="${t.id}"`)}
            </div>
          </article>
        `;
      }).join('') : `
        <div class="empty">
          <h3>Sua vitrine de vendas está vazia.</h3>
          <p>Publique suas próximas excursões com fotos reais, datas e opções de parcelamento para atrair clientes no aplicativo.</p>
          <div style="margin-top:14px;">
            ${button('new-showcase-trip', '+ Publicar Viagem no Expositor', 'small')}
          </div>
        </div>
      `}
    ` : renderClientsList())}
  `;
}

function renderClientsCards() {
  const q = (clientSearch || '').trim().toLowerCase();
  const filtered = clients.filter(c => {
    if (!q) return true;
    return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.notes || '').toLowerCase().includes(q);
  });

  if (!filtered.length) {
    if (clients.length === 0) {
      return `
        <div class="empty">
          <h3>Sua carteira de clientes está vazia.</h3>
          <p>Todos os passageiros que você cadastra nas suas viagens (por formulário ou colando lista) são salvos aqui automaticamente! Você também pode cadastrar novos contatos agora.</p>
          <div style="margin-top:14px;">
            ${button('new-client', '+ Cadastrar Primeiro Cliente', 'small')}
          </div>
        </div>
      `;
    }
    return `
      <div class="empty">
        <p>Nenhum cliente encontrado para "<b>${e(clientSearch)}</b>".</p>
      </div>
    `;
  }

  return filtered.map(c => {
    const initials = (c.name || 'C').split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    const cleanPhone = (c.phone || '').replace(/\D/g, '');
    const phoneParam = cleanPhone.length >= 10 ? (cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone) : '';
    const company = me.guide?.company_name || 'Nossa Agência';
    const waMsg = `Olá, *${c.name}*! Tudo bem? Aqui é da *${company}*. Temos novidades sobre nossas próximas excursões! 🚌✨`;
    const waUrl = phoneParam
      ? `https://api.whatsapp.com/send?phone=${phoneParam}&text=${encodeURIComponent(waMsg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(waMsg)}`;

    return `
      <div class="client-card">
        <div class="client-avatar">${e(initials)}</div>
        <div class="client-info">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <strong style="font-size:16px;">${e(c.name)}</strong>
            ${c.trips_count > 1
              ? `<span class="client-loyalty-badge frequent">⭐ Cliente Fiel (${c.trips_count} viagens)</span>`
              : (c.trips_count === 1 ? `<span class="client-loyalty-badge newcomer">🌱 1 viagem realizada</span>` : `<span class="client-loyalty-badge">Cadastrado</span>`)}
          </div>
          <div class="client-meta">
            ${c.phone ? `<span>📞 ${e(c.phone)}</span>` : '<span style="color:var(--muted);">Sem telefone</span>'}
            ${c.notes ? `<p style="margin:4px 0 0;font-size:12px;color:var(--muted);white-space:pre-wrap;">📝 ${e(c.notes)}</p>` : ''}
          </div>
        </div>
        <div class="client-actions">
          <a href="${waUrl}" target="_blank" class="button btn-whatsapp small" style="text-decoration:none;">
            💬 WhatsApp ↗
          </a>
          ${button('edit-client', '✏️ Editar', 'small outline', `data-id="${c.id}"`)}
          ${button('delete-client', '🗑️', 'small outline', `data-id="${c.id}" data-name="${e(c.name)}" title="Excluir cliente"`)}
        </div>
      </div>
    `;
  }).join('');
}

function renderClientsList() {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
      <div>
        <h3 style="margin:0;">Sua Base de Clientes Cadastrados</h3>
        <p class="hint" style="margin:2px 0 0;">Contatos salvos automaticamente das suas viagens ou cadastrados por você.</p>
      </div>
      <div>
        ${button('new-client', '+ Novo Cliente', 'light small')}
      </div>
    </div>

    <input type="text" id="client-search-input" class="client-search-box" placeholder="🔍 Buscar cliente por nome ou telefone..." value="${e(clientSearch)}">

    <div id="clients-container">
      ${renderClientsCards()}
    </div>
  `;
}

function clientModal(c = {}) {
  const isEdit = Boolean(c.id);
  open(`
    <div class="eyebrow">${isEdit ? 'Editar Dados' : 'Novo Contato'}</div>
    <h2>${isEdit ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}</h2>
    <p class="hint" style="margin-top:-6px;margin-bottom:18px;">
      ${isEdit ? 'Atualize as informações do seu cliente na carteira.' : 'Cadastre um cliente para adicioná-lo com rapidez às suas próximas excursões.'}
    </p>

    <form id="client-form" data-id="${e(c.id || '')}">
      <label for="client_name">Nome Completo</label>
      <input id="client_name" name="name" value="${e(c.name || '')}" placeholder="Ex: Maria das Graças Silva" maxlength="100" required>

      <label for="client_phone">WhatsApp / Telefone</label>
      <input id="client_phone" name="phone" type="tel" value="${e(c.phone || '')}" placeholder="Ex: (11) 98765-4321" maxlength="30">

      <label for="client_notes">Observações / Preferências (Opcional)</label>
      <textarea id="client_notes" name="notes" placeholder="Ex: Poltrona preferida na frente, restrições alimentares, já viajou para Gramado..." maxlength="500">${e(c.notes || '')}</textarea>

      ${button('submit', isEdit ? 'Salvar Alterações ↗' : 'Salvar na Carteira ↗')}
    </form>
  `);
}

function modalPullClients(tripId) {
  const existingNames = new Set(participants.map(p => (p.name || '').trim().toLowerCase()));
  const existingPhones = new Set(participants.map(p => (p.phone || '').trim()).filter(Boolean));

  if (!clients.length) {
    open(`
      <h2>👥 Puxar da Carteira</h2>
      <p>Você ainda não tem clientes cadastrados na carteira.</p>
      <div style="margin-top:16px;">
        ${button('new-client', '+ Cadastrar Primeiro Cliente', 'small')}
      </div>
    `);
    return;
  }

  const items = clients.map(c => {
    const isAlready = existingNames.has((c.name || '').trim().toLowerCase()) || (c.phone && existingPhones.has(c.phone.trim()));
    const initials = (c.name || 'C').split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    return `
      <label class="client-select-item ${isAlready ? 'already-added' : ''}">
        <input type="checkbox" name="clientId" value="${c.id}" ${isAlready ? 'disabled checked' : ''}>
        <div class="client-avatar" style="width:34px;height:34px;font-size:12px;">${e(initials)}</div>
        <div style="flex:1;">
          <strong>${e(c.name)}</strong> ${isAlready ? '<small style="color:var(--muted);">(Já nesta viagem)</small>' : ''}
          <div style="font-size:12px;color:var(--muted);">
            ${c.phone ? e(c.phone) : 'Sem telefone'} · ${c.trips_count > 0 ? `⭐ ${c.trips_count} viagens realizadas` : 'Novo cliente'}
          </div>
        </div>
      </label>
    `;
  }).join('');

  open(`
    <div class="eyebrow">Agilidade na Inclusão</div>
    <h2>👥 Puxar Passageiros da Carteira</h2>
    <p class="hint" style="margin-top:-6px;margin-bottom:14px;">
      Marque os clientes que vão nesta viagem para adicioná-los com 1 clique:
    </p>

    <form id="pull-clients-form" data-trip-id="${tripId}">
      <div class="client-select-list">
        ${items}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <span class="muted" style="font-size:12px;">Dica: quem já está na viagem aparece desabilitado.</span>
        ${button('submit', 'Incluir Selecionados na Viagem ↗', 'btn-whatsapp')}
      </div>
    </form>
  `);
}

function tripForm(t = {}, presetType = null) {
  const type = presetType || t.trip_type || (t.published ? 'showcase' : 'group');
  const isSold = type === 'group' || type === 'sold';

  tempPhotos = ['', '', ''];
  if (Array.isArray(t.photos)) {
    t.photos.slice(0, 3).forEach((p, idx) => { tempPhotos[idx] = p; });
  }

  open(`
    <div class="eyebrow">${isSold ? '🚌 Operação de Grupo Fechado' : '📢 Expositor de Vendas'}</div>
    <h2>${t.id ? (isSold ? 'Editar Viagem Vendida' : 'Editar Anúncio no Expositor') : (isSold ? 'Cadastrar Viagem Já Vendida' : 'Publicar Viagem para Venda')}</h2>
    <p class="hint" style="margin-top:-6px;margin-bottom:18px;">
      ${isSold
        ? 'Preencha os dados do roteiro. Ao salvar, você poderá cadastrar os passageiros e enviar os links de WhatsApp para controle do ônibus e paradas.'
        : 'Adicione fotos reais e opções de parcelamento para divulgar esta viagem no aplicativo e atrair reservas.'}
    </p>

    <form id="trip-form" data-id="${e(t.id || '')}" data-trip-type="${isSold ? 'group' : 'showcase'}">
      <input type="hidden" name="trip_type" value="${isSold ? 'group' : 'showcase'}">

      <label for="title">${isSold ? 'Nome da Viagem / Grupo' : 'Título Chamativo do Anúncio'}</label>
      <input id="title" name="title" value="${e(t.title || '')}" placeholder="${isSold ? 'Ex: Excursão Campos do Jordão - Grupo Fechado' : 'Ex: Fim de Semana Mágico em Campos do Jordão'}" maxlength="100" required>

      <label for="destination">Destino</label>
      <input id="destination" name="destination" value="${e(t.destination || '')}" placeholder="Cidade / Estado" maxlength="100" required>

      <div class="form-row">
        <div>
          <label for="date">Data de saída / embarque</label>
          <input id="date" name="date" type="date" value="${e(t.date || '')}" required>
        </div>
        <div>
          <label for="date_return">Data de retorno (opcional)</label>
          <input id="date_return" name="date_return" type="date" value="${e(t.date_return || '')}">
        </div>
      </div>

      ${isSold ? `
        <input type="hidden" name="price" value="${t.price ?? 0}">
        <input type="hidden" name="installment_text" value="">
      ` : `
        <div class="form-row">
          <div>
            <label for="price">Valor por pessoa (R$)</label>
            <input id="price" name="price" type="number" min="0" step="0.01" value="${t.price ?? ''}" placeholder="Ex: 350.00" required>
          </div>
          <div>
            <label for="installment_text">Opção de parcelamento (destaque de venda)</label>
            <input id="installment_text" name="installment_text" value="${e(t.installment_text || '')}" placeholder="Ex: ou até 3x de R$ 125 no cartão" maxlength="150">
          </div>
        </div>
      `}

      <div class="form-row">
        <div>
          <label for="capacity">Capacidade (Número de vagas / poltronas)</label>
          <input id="capacity" name="capacity" type="number" min="1" max="500" value="${t.capacity || 46}" required>
        </div>
        <div>
          <label for="meeting">Ponto de encontro e embarque</label>
          <input id="meeting" name="meeting" value="${e(t.meeting || '')}" maxlength="300" placeholder="Ex: Metrô Tietê às 06h30" required>
        </div>
      </div>

      <label for="description">Roteiro e Detalhes da Viagem</label>
      <textarea id="description" name="description" maxlength="2000" placeholder="${isSold ? 'Descreva os horários previstos, passeios inclusos e recomendações para os passageiros...' : 'Descreva os atrativos, o que está incluso, recomendações e encante os futuros participantes...'}" required>${e(t.description || '')}</textarea>

      <!-- 3 Slots de Fotos do Destino -->
      <div id="trip-photos-container">
        ${renderTripPhotoSlots()}
      </div>

      <label class="checkbox" style="margin-top:18px;">
        <input type="checkbox" name="published" ${isSold ? (t.published ? 'checked' : '') : (t.published !== 0 ? 'checked' : '')}>
        ${isSold ? 'Exibir também na vitrine pública do app (se ainda houver vagas sobrando)' : 'Publicar ativamente na vitrine do app para novos clientes'}
      </label>

      ${button('submit', isSold ? (t.id ? 'Salvar Alterações ↗' : 'Salvar e Gerenciar Passageiros ↗') : (t.id ? 'Salvar Anúncio ↗' : 'Publicar no Expositor ↗'))}
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
      <div class="controls" style="flex-direction:column;gap:12px;align-items:center;">
        ${view === 'traveler' ? `
          <button class="btn-passenger-return ${me.participant?.present ? 'confirmed' : ''}" data-action="return" id="return-button">
            ${me.participant?.present ? '✓ Você confirmou presença no ônibus' : '🟢 JÁ VOLTEI AO ÔNIBUS ✓'}
          </button>
          ${button('sound', sound ? 'Som ativado ✓' : 'Ativar som do alerta', 'small outline', 'id="sound-button"')}
        ` : `
          <div style="display:flex;gap:10px;">
            ${button('sound', sound ? 'Som ativado ✓' : 'Ativar som do alerta', 'small outline', 'id="sound-button"')}
            ${button('cancel-stop', 'Encerrar parada', 'small outline')}
          </div>
        `}
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
  presenceFilter = 'all';

  app.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:15px;">
      ${button('guide', '← Voltar ao Painel do Guia', 'outline small')}
      <div style="display:flex;gap:8px;">
        ${button('share-group-wa', '📲 Convidar Grupo no WhatsApp', 'small btn-whatsapp', `data-id="${id}"`)}
        ${button('edit-trip', '⚙️ Dados da Viagem', 'small outline', `data-id="${id}"`)}
      </div>
    </div>

    <div class="page-heading" style="margin-top:0;">
      <div class="eyebrow">🚌 Painel de Bordo & Gestão do Ônibus</div>
      <h1 id="trip-heading">Carregando viagem…</h1>
      <p id="trip-meta" class="muted"></p>
    </div>

    <div class="workspace">
      <div>
        ${timerPanel()}

        <section class="panel">
          <div class="panel-title">
            <h3>Hora de uma Pausa Técnica</h3>
            <span class="pill">Cronômetro do Ônibus</span>
          </div>
          <form id="stop-form">
            <label for="label">Local ou motivo da parada</label>
            <input id="label" name="label" value="Parada para lanche e banheiro" maxlength="200" required>
            <div class="form-row">
              <div>
                <label for="minutes">Minutos de parada</label>
                <input id="minutes" name="minutes" type="number" min="0" max="240" value="20" required>
              </div>
              <div>
                <label for="seconds">Segundos</label>
                <input id="seconds" name="seconds" type="number" min="0" max="59" value="0" required>
              </div>
            </div>
            <p class="hint">Ao iniciar, todos os passageiros são marcados fora do ônibus e a contagem regressiva começa em tempo real nos celulares deles.</p>
            ${button('submit', 'Iniciar contagem para o grupo ↗')}
          </form>
        </section>

        <section class="panel">
          <h3>Link de Acesso dos Passageiros</h3>
          <p class="hint">Envie no WhatsApp do grupo para que qualquer pessoa entre direto no painel da viagem.</p>
          <div class="link-box">
            <input aria-label="Link de inscrição" id="invite-link" readonly value="${e(location.origin + '/?trip=' + id)}">
            ${button('copy', 'Copiar link', 'small outline')}
          </div>
        </section>
      </div>

      <div>
        <section class="panel">
          <div class="panel-title" style="margin-bottom:12px;">
            <h3>Chamada & Passageiros</h3>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${button('pull-clients', '👥 Puxar da Carteira', 'small btn-whatsapp', `data-trip-id="${id}"`)}
              ${button('add-person', '+ Novo', 'small outline')}
              ${button('batch-add-people', '+ Colar Lista', 'small light')}
            </div>
          </div>

          <!-- Barra de Status do Ônibus e Filtros de Presença -->
          <div class="presence-filter-bar">
            <button class="presence-filter-btn ${presenceFilter === 'all' ? 'active' : ''}" data-action="filter-presence" data-filter="all">
              Todos (<span id="stat-total">0</span>)
            </button>
            <button class="presence-filter-btn ${presenceFilter === 'missing' ? 'active' : ''}" data-action="filter-presence" data-filter="missing">
              🔴 Ausentes (<span id="stat-missing">0</span>)
            </button>
            <button class="presence-filter-btn ${presenceFilter === 'present' ? 'active' : ''}" data-action="filter-presence" data-filter="present">
              🟢 No ônibus (<span id="stat-present">0</span>)
            </button>
          </div>

          <div id="people"></div>
        </section>

        <section class="panel">
          <h3>Mural de Avisos Imediatos</h3>
          <form id="message-form">
            <label for="text">Mensagem do guia para todos os passageiros</label>
            <textarea id="text" name="text" placeholder="Ex: Pessoal, o ônibus está estacionado na plataforma 3. Saída pontual!" maxlength="1000" required></textarea>
            ${button('submit', 'Enviar aviso para o grupo ↗')}
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

  const total = participants.length;
  const presentCount = participants.filter(p => p.present).length;
  const missingCount = total - presentCount;

  const statTotal = document.querySelector('#stat-total');
  const statPresent = document.querySelector('#stat-present');
  const statMissing = document.querySelector('#stat-missing');
  if (statTotal) statTotal.textContent = total;
  if (statPresent) statPresent.textContent = presentCount;
  if (statMissing) statMissing.textContent = missingCount;

  const filtered = participants.filter(p => {
    if (presenceFilter === 'present') return p.present;
    if (presenceFilter === 'missing') return !p.present;
    return true;
  });

  el.innerHTML = filtered.length ? filtered.map(p => `
    <div class="person">
      <div class="person-avatar">${e(p.name.slice(0, 2).toUpperCase())}</div>
      <div class="person-main">
        <strong>${e(p.name)}</strong>
        <small>${e(p.phone || 'Sem telefone')}</small>
      </div>
      <button class="btn-whatsapp-sm" data-action="person-wa" data-id="${p.id}" data-name="${e(p.name)}" data-phone="${e(p.phone || '')}" title="Enviar link exclusivo pelo WhatsApp">
        📲 WhatsApp
      </button>
      <button class="presence ${p.present ? 'yes' : ''}" data-action="presence" data-id="${p.id}" data-present="${p.present ? 0 : 1}">
        ${p.present ? '✓ No ônibus' : 'Confirmar volta'}
      </button>
      <button class="presence" style="color:var(--red);border-color:#f6c8c8;" data-action="remove-person" data-id="${p.id}" data-name="${e(p.name)}" title="Remover participante">
        ✕
      </button>
    </div>
  `).join('') : `
    <div style="text-align:center;padding:25px 15px;color:var(--muted);font-size:13px;">
      ${participants.length ? 'Nenhum participante nesta categoria de filtro.' : 'Nenhum participante cadastrado ainda. Use "+ Colar Lista" ou envie o link no WhatsApp.'}
    </div>
  `;
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
    else if (a === 'tab-guide-groups') {
      guideTab = 'groups';
      await guide();
    }
    else if (a === 'tab-guide-showcase') {
      guideTab = 'showcase';
      await guide();
    }
    else if (a === 'tab-guide-clients') {
      guideTab = 'clients';
      await guide();
    }
    else if (a === 'new-client') {
      clientModal({});
    }
    else if (a === 'edit-client') {
      const found = clients.find(c => c.id === b.dataset.id);
      clientModal(found || {});
    }
    else if (a === 'delete-client') {
      const cid = b.dataset.id;
      const cname = b.dataset.name || 'este cliente';
      if (confirm(`Remover "${cname}" da sua carteira de clientes?`)) {
        await api('/clients/' + cid, 'DELETE');
        toast(`"${cname}" foi removido da carteira.`);
        await loadClients();
        const cont = document.querySelector('#clients-container');
        if (cont) cont.innerHTML = renderClientsCards();
        else await guide();
      }
    }
    else if (a === 'pull-clients') {
      if (!clients.length) await loadClients();
      modalPullClients(b.dataset.tripId || activeId);
    }
    else if (a === 'new-sold-trip') tripForm({}, 'sold');
    else if (a === 'new-showcase-trip') tripForm({}, 'showcase');
    else if (a === 'filter-presence') {
      presenceFilter = b.dataset.filter || 'all';
      document.querySelectorAll('.presence-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === presenceFilter);
      });
      drawPeople();
    }
    else if (a === 'new-trip') tripForm();
    else if (a === 'edit-trip') {
      const found = trips.find(t => t.id === b.dataset.id);
      tripForm(found, b.dataset.type || found?.trip_type);
    }
    else if (a === 'join') join(b.dataset.id);
    else if (a === 'manage') await manage(b.dataset.id);
    else if (a === 'share-group-wa') {
      const tripId = b.dataset.id || activeId;
      const targetTrip = trips.find(t => t.id === tripId) || state?.trip || {};
      const company = me.guide?.company_name || 'Nossa Agência';
      const link = `${location.origin}/?trip=${tripId}`;
      const msg = `🚌 *Informações da Viagem - ${targetTrip.title || targetTrip.destination || 'Excursão'}*\n\nOlá pessoal! Aqui é da *${company}*.\nNosso painel de bordo já está disponível! Acesse o link abaixo para acompanhar os horários, cronômetro de paradas e confirmar presença:\n\n👉 ${link}`;
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;

      open(`
        <h2>📲 Enviar no Grupo do WhatsApp</h2>
        <p>Compartilhe o link do painel de bordo com todos os passageiros da viagem.</p>
        <div class="notice">
          <strong>Mensagem formatada:</strong><br>
          <span style="font-size:12px;white-space:pre-wrap;">${e(msg)}</span>
        </div>
        <div style="display:flex;gap:10px;margin-top:15px;flex-wrap:wrap;">
          <a href="${waUrl}" target="_blank" class="button btn-whatsapp" style="text-decoration:none;">
            Abrir WhatsApp e Enviar ↗
          </a>
          <button class="button outline" data-action="copy-text" data-text="${e(msg)}">Copiar Mensagem</button>
        </div>
      `);
    }
    else if (a === 'person-wa') {
      const pid = b.dataset.id;
      const pname = b.dataset.name || 'passageiro';
      const pphone = b.dataset.phone || '';
      const v = await api('/trips/' + activeId + '/access', 'POST', { id: pid });
      const link = location.origin + '/?access=' + v.token;
      const company = me.guide?.company_name || 'Nossa Agência';
      const dest = state?.trip?.destination || 'Nossa Viagem';
      const msg = `Olá, *${pname}*! 👋\n\nAqui é da *${company}*. Seu acesso exclusivo ao painel da viagem para *${dest}* está pronto:\n\n👉 ${link}\n\nPor ele você acompanha os avisos do guia, o cronômetro das paradas e confirma seu retorno ao ônibus! Boa viagem! 🚌✨`;

      const cleanPhone = pphone.replace(/\D/g, '');
      const phoneParam = cleanPhone.length >= 10 ? (cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone) : '';
      const waUrl = phoneParam
        ? `https://api.whatsapp.com/send?phone=${phoneParam}&text=${encodeURIComponent(msg)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;

      open(`
        <h2>📲 Enviar Acesso para ${e(pname)}</h2>
        <p>Envie este link exclusivo no WhatsApp de <b>${e(pname)}</b>. Ele entra direto no painel da viagem sem precisar digitar senha.</p>
        <div class="notice">
          <strong>Mensagem pronta:</strong><br>
          <span style="font-size:12px;white-space:pre-wrap;">${e(msg)}</span>
        </div>
        <div style="display:flex;gap:10px;margin-top:15px;flex-wrap:wrap;">
          <a href="${waUrl}" target="_blank" class="button btn-whatsapp" style="text-decoration:none;">
            ${phoneParam ? 'Enviar no WhatsApp Direto ↗' : 'Abrir WhatsApp e Escolher Contato ↗'}
          </a>
          <button class="button outline" data-action="copy-text" data-text="${e(msg)}">Copiar Mensagem</button>
        </div>
      `);
    }
    else if (a === 'copy-text') {
      const txt = b.dataset.text;
      try {
        await navigator.clipboard.writeText(txt);
        toast('Mensagem copiada para a área de transferência!');
      } catch {
        toast('Selecione e copie o texto acima.');
      }
    }
    else if (a === 'batch-add-people') {
      open(`
        <h2>📋 Colar Lista de Passageiros</h2>
        <p>Cole a lista de passageiros da viagem (um por linha). Se tiver telefone, separe por vírgula ou traço:</p>
        <form id="batch-person-form">
          <label for="batchText">Lista (Exemplo: João Silva - 11999998888)</label>
          <textarea id="batchText" name="batchText" rows="10" placeholder="Ana Paula Ferreira&#10;Carlos Eduardo Souza, 11988887777&#10;Mariana Lima - 21977776666" style="font-family:monospace;font-size:13px;line-height:1.5;" required></textarea>
          ${button('submit', 'Cadastrar todos na viagem ↗')}
        </form>
      `);
    }
    else if (a === 'remove-person') {
      const pid = b.dataset.id;
      const pname = b.dataset.name || 'este participante';
      if (confirm(`Remover ${pname} da lista de participantes desta viagem?`)) {
        await api('/trips/' + activeId + '/participants', 'DELETE', { id: pid });
        toast(`${pname} foi removido da viagem.`);
        await sync();
      }
    }
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
      try { if (navigator.vibrate) navigator.vibrate(200); } catch {}
      toast('Presença confirmada! O guia já sabe que você está no ônibus.');
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
      data.trip_type = form.dataset.tripType || (data.published ? 'showcase' : 'group');
      const isNew = !form.dataset.id;
      const res = await api('/trips' + (form.dataset.id ? '/' + form.dataset.id : ''), form.dataset.id ? 'PATCH' : 'POST', data);
      close();
      toast('Viagem salva com sucesso!');
      await loadTrips();
      if (isNew && data.trip_type === 'group') {
        await manage(res.id);
        toast('Viagem vendida cadastrada! Agora você pode cadastrar os passageiros.');
      } else {
        guideTab = data.trip_type === 'group' ? 'groups' : 'showcase';
        await guide();
      }
    }
    else if (form.id === 'batch-person-form') {
      const res = await api('/trips/' + activeId + '/participants', 'POST', { batchText: data.batchText });
      close();
      toast(`${res.count || 'Vários'} passageiros cadastrados com sucesso!`);
      await sync();
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
    else if (form.id === 'client-form') {
      const cid = form.dataset.id;
      if (cid) {
        await api('/clients/' + cid, 'PATCH', data);
        toast('Dados do cliente atualizados!');
      } else {
        await api('/clients', 'POST', data);
        toast('Cliente adicionado à sua carteira!');
      }
      close();
      await loadClients();
      if (view === 'guide' && guideTab === 'clients') {
        const cont = document.querySelector('#clients-container');
        if (cont) cont.innerHTML = renderClientsCards();
        else await guide();
      }
    }
    else if (form.id === 'pull-clients-form') {
      const tripId = form.dataset.tripId || activeId;
      const checkedBoxes = Array.from(form.querySelectorAll('input[name="clientId"]:checked:not(:disabled)'));
      const clientIds = checkedBoxes.map(cb => cb.value);
      if (!clientIds.length) {
        toast('Nenhum novo cliente selecionado.');
        return;
      }
      const res = await api(`/trips/${tripId}/import-clients`, 'POST', { clientIds });
      close();
      toast(`${res.count || clientIds.length} passageiro(s) adicionados à viagem!`);
      await sync();
    }
  } catch (err) {
    toast(err.message);
  } finally {
    if (b) b.disabled = false;
  }
});

document.addEventListener('input', ev => {
  if (ev.target.id === 'client-search-input') {
    clientSearch = ev.target.value.toLowerCase();
    const cont = document.querySelector('#clients-container');
    if (cont) cont.innerHTML = renderClientsCards();
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
