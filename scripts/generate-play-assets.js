const sharp = require('sharp');
const path = require('node:path');
const fs = require('node:fs');

const iconSrc = 'C:/Users/user/.gemini/antigravity-ide/brain/fba27b41-151c-46c2-93cf-5b6eaa0bcec9/guiaup_icon_emblem_1791755274422.jpg';
const bannerSrc = 'C:/Users/user/.gemini/antigravity-ide/brain/fba27b41-151c-46c2-93cf-5b6eaa0bcec9/guiaup_banner_feature_1791755485647.jpg';

const outDir = path.join(__dirname, '..', 'assets-loja');
const publicDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  console.log('Gerando ativos oficiais para Google Play Store...');

  // 1. Ícone da Loja - 512x512 PNG (32-bit, sem transparência)
  await sharp(iconSrc)
    .resize(512, 512, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, 'icone-google-play-512x512.png'));
  console.log('✓ icone-google-play-512x512.png gerado com sucesso!');

  // 2. Ícones para PWA e Android (192x192 e 512x512)
  await sharp(iconSrc)
    .resize(512, 512, { fit: 'cover' })
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));

  await sharp(iconSrc)
    .resize(192, 192, { fit: 'cover' })
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));
  console.log('✓ icon-512.png e icon-192.png atualizados na pasta public/');

  // 3. Gráfico de Recursos da Loja - 1024x500 PNG
  await sharp(bannerSrc)
    .resize(1024, 500, { fit: 'cover', position: 'center' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, 'grafico-recursos-1024x500.png'));
  console.log('✓ grafico-recursos-1024x500.png gerado com sucesso!');

  // 4. Versão em alta resolução para marketing e campanhas
  await sharp(bannerSrc)
    .resize(1920, 1080, { fit: 'cover' })
    .jpeg({ quality: 95 })
    .toFile(path.join(outDir, 'banner-alta-resolucao-campanhas.jpg'));
  console.log('✓ banner-alta-resolucao-campanhas.jpg gerado com sucesso!');

  console.log('Todos os ativos foram gerados perfeitamente!');
}

main().catch(err => {
  console.error('Erro ao gerar ativos:', err);
  process.exit(1);
});
