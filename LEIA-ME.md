# GuiaUp

Plataforma web responsiva e SaaS para guias de turismo e agências de viagens organizarem excursões com marca própria.
Agora com suporte **multi-empresa (multi-tenant)**, **personalização com logo da empresa**, **cadastro de viagem com até 3 fotos reais**, **valores à vista e parcelado**, **período de teste grátis de 7 dias** e **planos de assinatura recorrente**.

Requer Node.js 24 ou superior. Zero dependências externas (sem necessidade de `npm install`).

---

## Novidades da Versão 1.2

1. **Separação Clara das Duas Atividades do Guia:**
   * **Atividade 1 — Cadastrar Viagem Já Vendida (Grupo Fechado / Operação):**
     * O guia cadastra o grupo da viagem fechada com roteiro, datas, ponto de encontro e capacidade.
     * Foco na operação de campo, lista de passageiros e controle do ônibus.
   * **Atividade 2 — Publicar para Venda (Expositor Comercial / Vitrine):**
     * Divulgação de próximas excursões no app com fotos reais, valores e parcelamento para novos clientes.
   * Abas dedicadas no painel do guia: `[ 🚌 Grupos em Operação ]` e `[ 📢 Expositor de Vendas ]`.

2. **Integração com WhatsApp:**
   * **Link Exclusivo do Passageiro via WhatsApp:** Ao lado de cada passageiro, o guia clica em `📲 WhatsApp` e envia a mensagem pronta com o link de acesso direto (token seguro válido por 7 dias, sem necessidade de senha).
   * **Convidar Grupo pelo WhatsApp:** Botão para disparar o convite do painel de bordo diretamente no grupo da viagem.

3. **Cadastro de Passageiros em Lote (Colar Lista):**
   * O guia pode colar a lista inteira do Excel/Word (um passageiro por linha, formato `Nome - Telefone`) e o sistema cadastra todos instantaneamente.

4. **Painel de Chamada do Ônibus com Filtros Rápidos:**
   * Durante as paradas técnicas, o guia visualiza em tempo real:
     * `[ Todos ]`, `[ 🔴 Ausentes ]` (quem falta voltar) e `[ 🟢 No ônibus ]`.
   * Permite confirmação manual pelo guia ou automática pelo próprio passageiro.

5. **Experiência do Passageiro no Celular:**
   * Botão destacado e tátil **"🟢 JÁ VOLTEI AO ÔNIBUS ✓"** com vibração e confirmação imediata no painel do guia.

---

## Novidades da Versão 1.1

1. **Multi-Guias & Multi-Empresas:**
   * Múltiplos guias e agências podem se cadastrar independentemente com seu próprio e-mail e senha.
   * Viagens, grupos e dados de cada empresa são completamente isolados.

2. **Personalização com Nome e Logo da Empresa (White-Label):**
   * No cadastro ou no painel, o guia pode clicar e carregar a logo/ícone da sua agência (PNG, JPG, SVG).
   * A logo é processada de forma leve e armazenada com segurança.
   * Quando os passageiros acessam o link da viagem ou a contagem da parada no celular, eles veem a **logo e o nome da agência do guia** em destaque no topo.

3. **Cadastro Completo de Viagem (Fotos, Parcelamento e Datas):**
   * **Datas:** Data de saída e data de retorno (para viagens de fim de semana/feriado ou bate-e-volta).
   * **Valores:** Valor à vista por pessoa e opções de parcelamento (ex: *"ou até 3x de R$ 130 no cartão"*).
   * **Até 3 Fotos do Destino:** 3 slots interativos onde o guia clica e escolhe fotos reais do local (cachoeiras, praias, hotel, etc.).
   * **Galeria para os Passageiros:** A primeira foto vira a capa do card da viagem, e na página de detalhes os passageiros visualizam a galeria completa com as fotos do lugar.

4. **Monetização & Modelo de Assinatura:**
   * **7 dias de teste grátis:** Todo novo guia recebe 7 dias de acesso liberado para testar no celular com o grupo.
   * **Seção de Planos na Landing Page:** Exibição do Plano Guia Pro (R$ 39,90/mês) e Plano Anual (R$ 349,00/ano).
   * **Controle de Assinatura:** Badge de status no painel do guia com contagem regressiva dos dias de teste e opção para ativar o Plano Pro.

---

## Como Iniciar

1. Abra [Iniciar-GuiaUp.cmd](file:///f:/GuiaUp/Iniciar-GuiaUp.cmd) ou execute no terminal:
   ```powershell
   node server.js
   ```
2. No navegador, acesse `http://localhost:3080`.
3. Clique em **"Criar Conta da Empresa"** ou **"Área do guia"**:
   * Informe o Nome da Empresa, Nome do Responsável, E-mail, Senha e carregue a **Logo da sua empresa**.
   * Sua conta é ativada instantaneamente com 7 dias de avaliação gratuita.
4. Crie uma viagem informando destino, data de saída, data de retorno, valor à vista, parcelamento, vagas, ponto de encontro e **adicione até 3 fotos do lugar**.
5. No painel **Acompanhar grupo**, copie o link da viagem e compartilhe com os passageiros.
6. Durante a excursão, inicie uma parada com o cronômetro sincronizado e avise todo o grupo em tempo real.

---

## Como Testar no Celular (Mesma Rede Wi-Fi)

1. Conecte o computador e o celular na mesma rede Wi-Fi.
2. Descubra o IP do computador no terminal com `ipconfig` (procure por IPv4, ex: `192.168.1.15`).
3. No celular, acesse:
   ```text
   http://IP-DO-COMPUTADOR:3080
   ```
4. O app abre com visual mobile responsivo, permitindo testar o cadastro, upload de fotos pela câmera/galeria e o cronômetro com alerta sonoro.

---

## Testes Automatizados

Para rodar todos os testes de integração (retrocompatibilidade, multi-empresa, logo, fotos e planos):
```powershell
npm test
```
Ambas as suítes cobrem:
* `test.js`: Permissões, lotação, links temporários, paradas e persistência.
* `test-company-pro.js`: Cadastro de agências, upload e edição de logo, 3 fotos do destino, parcelamento, período de teste de 7 dias, assinatura Pro e isolamento de dados entre empresas.
