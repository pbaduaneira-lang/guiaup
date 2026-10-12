# 🧭 GuiaUp — Dossiê Técnico e Registro Geral do Projeto

> **Documento Oficial de Registro e Continuidade**  
> Data da última atualização: 12 de outubro de 2026  
> Status do Aplicativo: **Em análise no Google Play Store (Produção)**  
> Versão do Pacote: `1.0.0.0` (`1.0.0 - Lançamento Oficial`)  

---

## 1. Identificação Geral do Aplicativo e Loja

* **Nome do Aplicativo:** GuiaUp
* **Conta Desenvolvedor:** Pessoa Jurídica (PJ / CNPJ)
* **Package Name (ID do Pacote Android):** `br.com.guiaup.www.twa`
* **Tipo de Aplicativo:** TWA (Trusted Web Activity) / PWA Store Ready
* **Domínio Oficial de Produção:** [https://www.guiaup.com.br](https://www.guiaup.com.br)
* **Hospedagem:** Vercel (Edge Network global com SSL TLS 1.3)
* **DNS Autoridade:** Locaweb (`guiaup.com.br` e `www.guiaup.com.br` apontados via A e CNAME para Vercel)
* **SHA-256 Fingerprint (Assinatura Digital):**  
  `6A:37:DD:45:F8:63:B5:21:51:F1:52:5D:C9:27:FA:1E:FF:BA:20:21:CA:2F:EB:F2:48:8E:80:DF:3A:55:11:CF`
* **Digital Asset Links Ativo:**  
  [https://www.guiaup.com.br/.well-known/assetlinks.json](https://www.guiaup.com.br/.well-known/assetlinks.json)
* **Política de Privacidade LGPD:**  
  [https://www.guiaup.com.br/privacidade](https://www.guiaup.com.br/privacidade)

---

## 2. Credenciais de Revisão do Google Play Console

Configuradas na seção de **Acesso ao app** para os avaliadores do Google:
* **Identificação:** `Tour Guide Admin Access`
* **Usuário / E-mail:** `google.review@guiaup.com.br`
* **Senha:** `GuiaUpGoogle2026!`
* **Dados Demo Ativos:** Guia de testes cadastrado no Turso com viagem demonstrativa para *Campos do Jordão*, passageiros cadastrados e cronômetro liberado.

---

## 3. Banco de Dados na Nuvem (Turso Cloud)

* **Provedor:** Turso (libSQL / SQLite Serverless na nuvem)
* **Região:** `aws-sa-east-1` (São Paulo, Brasil — latência ultra baixa)
* **Endpoint:** `libsql://guiaup-edmiltonluisdefacio.aws-sa-east-1.turso.io`
* **Token de Autenticação:** Armazenado de forma segura no arquivo `.env` e nas variáveis de ambiente da Vercel (`TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`).
* **Estrutura das 8 Tabelas:**
  1. `settings`: configurações globais e flags do sistema.
  2. `guides`: cadastro de guias e agências (nome, empresa, e-mail, telefone, senha scrypt, logo base64, status da assinatura Pro e data de expiração do teste grátis).
  3. `trips`: viagens cadastradas (título, destino, datas de saída/retorno, preço, parcelamento, vagas, fotos em JSON, ponto de encontro e publicação).
  4. `participants`: passageiros vinculados a cada viagem (nome, telefone/WhatsApp e status de presença no ônibus).
  5. `sessions`: sessões ativas com autenticação segura.
  6. `stops`: paradas técnicas e refeições com cronômetro sincronizado via timestamp de servidor.
  7. `participant_links`: tokens de acesso individual para passageiros.
  8. `messages`: mural de avisos e comunicados em tempo real do guia.

---

## 4. Repositório e Código-Fonte

* **GitHub:** `https://github.com/pbaduaneira-lang/guiaup` (Branch principal: `main`)
* **Deploy Automático:** Todo `git push origin main` compila e atualiza o site na Vercel em segundos.
* **Testes Automatizados:**  
  `npm test` executa 2 suites de teste (`test.js` e `test-company-pro.js`) garantindo integridade de permissões, multi-empresa, banco e cronômetro (100% de sucesso).

---

## 5. Acervo de Ativos Gráficos Oficiais da Loja

Armazenados localmente na pasta `F:\GuiaUp\assets-loja\`:
1. `icone-google-play-512x512.png`: 512x512 px exatos, 32-bit PNG, cantos retos sem transparência (Emblema ônibus com seta).
2. `grafico-recursos-1024x500.png`: 1024x500 px exatos, cinematográfico, estrada de serra com ônibus moderno, sem corte de texto.
3. `banner-alta-resolucao-campanhas.jpg`: 1920x1080 px em alta resolução para marketing e redes sociais.
4. `screenshot-1-explorar-viagens.png`: Captura de tela 1080x1920 px (Explorar viagens).
5. `screenshot-2-detalhes-roteiro.png`: Captura de tela 1080x1920 px (Detalhes da viagem e fotos).
6. `screenshot-3-cronometro-paradas.png`: Captura de tela 1080x1920 px (Cronômetro sincronizado).
7. `screenshot-4-painel-do-guia.png`: Captura de tela 1080x1920 px (Painel de chamada digital do guia).
8. `GuiaUp.aab`: Pacote compilado enviado ao Google Play.
9. `pacote-google-play/signing.keystore`: Chave criptográfica permanente de assinatura do app Android gerada pelo PWABuilder (fundamental para futuras atualizações nativas).

---

## 6. Como Funciona a Atualização Contínua Sem Depender da Loja (TWA)

Como o GuiaUp foi construído com a arquitetura moderna **Trusted Web Activity (TWA)**:
* O arquivo `.aab` aprovado na Google Play é como uma moldura de altíssima performance.
* O motor real do aplicativo roda no código conectado em `https://www.guiaup.com.br`.
* **Vantagem Estratégica:** Quando quisermos criar uma nova tela, mudar o layout, incluir novos botões, filtros ou lógicas de banco, **basta atualizar o código aqui e fazer o push**. Todos os celulares que tiverem o app instalado verão a melhoria **imediatamente**, sem precisar enviar nova versão para fila de análise do Google!

---

## 7. Backlog de Melhorias e Implementações Futuras

Para quando retomarmos os trabalhos:

1. **Blindagem e Isolamento Multi-Agência:**
   * Garantir que cada agência/guia tenha uma carteira restrita de passageiros.
   * Passageiros cadastrados por uma agência permanecem vinculados estritamente ao histórico e banco de dados dessa agência.
2. **Acesso Direto do Passageiro no Celular:**
   * Geração de link com token inteligente para envio no WhatsApp (ex: `guiaup.com.br/v/[id-da-viagem]?token=xyz`).
   * O passageiro clica no WhatsApp e já cai direto dentro da sua viagem, com a logo da agência, cronômetro e botão de "Estou no ônibus", sem burocracia de senha.
3. **Alertas Sonoros e Notificações no Cronômetro:**
   * Alerta sonoro / vibração quando faltarem 5 minutos e quando a contagem regressiva zerar.
4. **Monetização Automatizada para os Guias:**
   * Integração de checkout transparente (PIX / Cartão) para a contratação dos planos Pro (R$ 39,90/mês e R$ 349/ano).
5. **Exportação de Lista de Presença:**
   * Botão para gerar e baixar a lista de chamada em PDF ou enviar resumo no grupo do WhatsApp da viagem.
