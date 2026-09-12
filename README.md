# Cardiag

[![CI](https://github.com/qle-bevi/cardiag/actions/workflows/ci.yml/badge.svg)](https://github.com/qle-bevi/cardiag/actions/workflows/ci.yml)

Application de diagnostic automobile locale, développée avec **Rust, Tauri 2, React et TypeScript**. L’objectif est de lire et d’effacer les codes de défaut moteur OBD-II/EOBD des véhicules compatibles.

**État actuel : initialisation du projet.** La fenêtre affiche l’état de connexion du service Rust. La communication avec un véhicule n’est pas implémentée ; les commandes de lecture et d’effacement sont désactivées. Aucune connexion au câble, aucun diagnostic et aucun effacement ne sont effectués.

## Démarrer

Installer Git, Node.js **24.18.0**, npm **11.16.0** et [rustup](https://rustup.rs/). Le fichier `rust-toolchain.toml` fixe Rust **1.98.1** et ses composants. `.nvmrc` et la configuration Volta fixent Node ; avec une autre méthode d’installation, vérifier ces versions manuellement.

Installer aussi les [prérequis Tauri propres au système](https://v2.tauri.app/start/prerequisites/) :

- **Windows 11 (cible initiale)** : Microsoft C++ Build Tools avec la charge « Développement Desktop en C++ », le SDK Windows et Microsoft Edge WebView2. Utiliser la chaîne Rust MSVC.
- **macOS** : les outils en ligne de commande Xcode (`xcode-select --install`).
- **Linux (Ubuntu/Debian)** : les bibliothèques de développement GTK/WebKit ci-dessous et une session graphique pour ouvrir l’application.

```sh
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

```sh
git clone https://github.com/qle-bevi/cardiag.git
cd cardiag
npm ci
npm run tauri dev
```

Aucun câble ni pilote constructeur n’est nécessaire pour lancer cette version. Le dossier doit être ouvert à la racine du dépôt pour utiliser les commandes documentées.

`npm run dev` ouvre uniquement le serveur de développement web. Dans un navigateur, le statut « État de connexion indisponible » est attendu : le service Rust n’y est pas présent.

## Commandes

| Commande                                                         | Usage                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------- |
| `npm run tauri dev`                                              | Lancer l’application de bureau avec rechargement           |
| `npm run build`                                                  | Vérifier TypeScript et compiler l’interface                |
| `npm test`                                                       | Tester le contrat IPC et les états de l’interface          |
| `npm run format:check`                                           | Vérifier le formatage des fichiers web et de documentation |
| `cargo fmt --all -- --check`                                     | Vérifier le formatage Rust                                 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Analyser le code Rust                                      |
| `cargo test --workspace --locked`                                | Tester le code Rust, application comprise                  |
| `cargo test -p diagnostic-core --locked`                         | Tester uniquement le domaine, sans GTK ni WebKit           |
| `npm run tauri build -- --no-bundle -- --locked`                 | Compiler l’exécutable de bureau sans installateur          |

Exécuter `npm run build` avant les vérifications Rust de l’ensemble du workspace pour fournir les ressources de l’interface. Les exécutables sont produits dans `target/release/` (`cardiag.exe` sous Windows). Les installateurs signés et les publications de versions ne sont pas configurés dans ce premier jalon.

## Architecture

- `src/` : interface React en français et client TypeScript de la commande Tauri.
- `src-tauri/` : application de bureau et adaptateur IPC. Seule la commande `get_connection_status` est exposée ; elle renvoie `{ "state": "disconnected" }`.
- `crates/diagnostic-core/` : domaine Rust portable, indépendant de Tauri et du système d’exploitation.

Un jeu de données partagé dans `tests/fixtures/` vérifie la cohérence du contrat Rust/TypeScript. Les futurs transports matériels seront placés dans des crates séparées, derrière une interface du domaine définie lors de leur intégration. Les bindings J2534 et le chargement des DLL Windows ne devront pas entrer dans l’interface React ni dans le domaine portable.

L’application charge uniquement ses ressources locales, sans compte, serveur distant ni télémétrie. Aucun pilote constructeur n’est distribué dans ce dépôt.

## Matériel et compatibilité

Le premier câble prévu est le **GO-DIAG GD101**. Sa [fiche produit](https://godiag.com/products/godiag-gd101-j2534-passthru-diagnostic-cable-for-ford-mazda-honda-toyota-renault-forscan-scanmaster-sdd-pcm-flash-elm327-j1979) annonce J2534 et une émulation ELM327. Ces annonces ne constituent pas une validation avec Cardiag.

Premier véhicule prévu : **Skoda Octavia diesel, 2005**. La motorisation précise, la génération, le protocole et la compatibilité restent à vérifier sur le véhicule.

| Système | Application                                                   | GD101 / diagnostic réel     |
| ------- | ------------------------------------------------------------- | --------------------------- |
| Windows | Compilation vérifiée par CI ; première cible de test véhicule | Non implémenté, non validé  |
| Linux   | Compilation vérifiée par CI                                   | Accès au matériel à étudier |
| macOS   | Compilation vérifiée par CI                                   | Accès au matériel à étudier |

Une compilation réussie ne valide ni l’accès au câble ni la compatibilité d’un véhicule. Le [suivi de validation](docs/validation.md) distingue compilation, lancement graphique et essais matériels.

## Prochaines étapes

1. **Intégration GD101 sous Windows** : installer les pilotes depuis le fabricant, vérifier leur interface J2534 et leur architecture 32/64 bits, puis déterminer le chargement natif adapté. Tester la détection, la connexion, les délais et la déconnexion ; identifier le protocole de l’Octavia sans supposer CAN.
2. **Lecture OBD-II/EOBD** : implémenter les échanges standard et afficher les codes moteur ; distinguer absence de défaut, absence de réponse et protocole non pris en charge.
3. **Effacement** : ajouter une action explicite avec confirmation et expliquer ses effets, notamment la réinitialisation des moniteurs de préparation ; ne jamais effacer automatiquement à la connexion.
4. **Autres systèmes** : évaluer les interfaces réellement accessibles sous Linux et macOS, puis implémenter les transports correspondants.

ABS, airbags, diagnostics constructeur, codage et reprogrammation ECU sont hors du premier jalon de diagnostic moteur.

## Licence

[MIT](LICENSE).
