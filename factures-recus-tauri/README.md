
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
npm ci
npm run tauri:dev
```

Pour la recette dans un navigateur, `npm run dev`. Contrôles reproductibles :
`npm test` (Node 22.20+), `npm run typecheck` et `npm run build`.

## Construire l'installable
```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin --bundles app -- --locked
```
- macOS: `src-tauri/target/universal-apple-darwin/release/bundle/macos/Factures & Recus.app`
- Windows : la commande `npm run tauri:build -- --bundles msi -- --locked` et l’installateur MSI restent à recevoir séparément.

> Les données restent locales (LocalStorage). Aucune connexion réseau n'est requise.

## Ce que conserve le carnet

Le carnet saisit des dépenses, revenus et transferts en XAF, conserve leurs
justificatifs et exporte les mouvements. Il ne crée pas de factures commerciales
et ne transmet aucune écriture à une banque ou à une comptabilité distante.
Les SMS produisent une proposition à vérifier puis à confirmer ; les formats
non reconnus ou ambigus demandent une saisie manuelle.

Une opération et le classement de son reçu sont enregistrés ensemble dans la
clé locale existante `fr-app-v1`. Le reçu reste dans la boîte tant que
l'enregistrement n'a pas réussi. Si le stockage est plein ou indisponible,
l'erreur reste visible et le formulaire n'est pas vidé. Les sauvegardes existantes
complètes restent lisibles ; un contenu invalide n'est jamais remplacé par
des valeurs par défaut au démarrage.

La sauvegarde JSON contient catégories, portefeuilles, opérations et images.
Sa restauration valide le document entier, demande confirmation puis remplace
le carnet en une seule écriture. Une référence absente, un montant invalide ou
une erreur de stockage conserve le carnet précédent. Le CSV décrit les
mouvements et ne remplace pas cette sauvegarde des justificatifs.

Le stockage est local au profil de l'application ou à l'origine du navigateur.
Il n'est ni un service synchronisé ni une sauvegarde externe. Exporter le JSON
avant de changer de poste ou de profil. L'isolation de plusieurs entreprises,
le raccord économique au Shinkiro et la restauration de toute la suite restent
des réceptions distinctes.

## Périmètre de vérification

La CI contrôle les données, TypeScript et le build web. Le job macOS compile
séparément l'application Tauri universelle Intel/Apple Silicon, avec le lock Rust reçu, et conserve un ZIP de l'application avec ses
permissions. Un build ne prouve pas l'ouverture d'une application sur une machine
utilisateur. La signature/notarisation et la recette Windows restent à recevoir ;
aucun installateur Windows n'est qualifié par le job macOS.
