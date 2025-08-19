
# Factures & Reçus — Desktop (Tauri)

## Prérequis communs
- Node.js LTS (18+ recommandé)
- npm (ou pnpm/yarn)

## macOS
1. Outils Xcode:
   ```bash
   xcode-select --install
   ```
2. Rust (rustup):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   # puis: source $HOME/.cargo/env
   ```

## Windows
1. Node.js LTS (via winget ou site officiel)
2. Outils de build:
   - Visual Studio Build Tools (sélectionner "Desktop development with C++")
   - WebView2 Runtime
3. Rust:
   - Installer via rustup-init.exe

## Lancer en développement
```bash
npm install
npm run tauri:dev
```

## Construire l'installable
```bash
npm run tauri:build
```
- macOS: `src-tauri/target/release/bundle/app/Factures & Recus.app`
- Windows: `src-tauri/target/release/bundle/msi/factures-recus_*_x64_en-US.msi`

> Les données restent locales (LocalStorage). Aucune connexion réseau n'est requise.
