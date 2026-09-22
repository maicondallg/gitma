#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const target = process.argv[2];

if (!target) {
  console.error('\nUso: npm run bump <nova-versao | patch | minor | major>');
  console.error('Exemplo: npm run bump 0.1.4');
  console.error('         npm run bump patch\n');
  process.exit(1);
}

try {
  console.log(`\n🚀 Atualizando versão para "${target}"...`);

  const pkgPath = resolve(rootDir, 'package.json');
  const initialPkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const hadPackageManager = 'packageManager' in initialPkg;

  // 1. Atualiza package.json e package-lock.json
  execSync(`npm version ${target} --no-git-tag-version --allow-same-version`, {
    cwd: rootDir,
    stdio: 'inherit',
  });

  const updatedPkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!hadPackageManager && 'packageManager' in updatedPkg) {
    delete updatedPkg.packageManager;
    writeFileSync(pkgPath, JSON.stringify(updatedPkg, null, 2) + '\n', 'utf8');
  }

  const newVersion = updatedPkg.version;

  // 2. Atualiza [workspace.package] no Cargo.toml raiz
  const cargoPath = resolve(rootDir, 'Cargo.toml');
  const cargoToml = readFileSync(cargoPath, 'utf8');

  const cargoRegex = /(\[workspace\.package\][\s\S]*?version\s*=\s*")[^"]+(")/;
  if (!cargoRegex.test(cargoToml)) {
    throw new Error('Não foi possível encontrar [workspace.package] version no Cargo.toml raiz.');
  }

  const updatedCargoToml = cargoToml.replace(cargoRegex, `$1${newVersion}$2`);
  writeFileSync(cargoPath, updatedCargoToml, 'utf8');
  console.log(`✔ Cargo.toml atualizado para ${newVersion}`);

  // 3. Atualiza src-tauri/tauri.conf.json
  const tauriConfPath = resolve(rootDir, 'src-tauri/tauri.conf.json');
  if (existsSync(tauriConfPath)) {
    const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'));
    tauriConf.version = newVersion;
    writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
    console.log(`✔ src-tauri/tauri.conf.json atualizado para ${newVersion}`);
  }

  // 4. Atualiza Cargo.lock
  console.log('🔄 Atualizando Cargo.lock...');
  execSync('cargo check --workspace', {
    cwd: rootDir,
    stdio: 'inherit',
  });
  console.log('✔ Cargo.lock atualizado');

  console.log(`\n✨ Versão sincronizada com sucesso para v${newVersion}!`);
  console.log('Arquivos sincronizados automaticamente:');
  console.log('  • package.json & package-lock.json');
  console.log('  • src-tauri/tauri.conf.json');
  console.log('  • Cargo.toml & Cargo.lock');
  console.log('  • crates/gitma-core & src-tauri (herdam via workspace.package)');
  console.log('  • UI HomeTab & SettingsModal (importam de ui/src/version.ts)\n');
} catch (err) {
  console.error('\n❌ Erro ao atualizar versão:', err.message);
  process.exit(1);
}
