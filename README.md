# Cardiag

[![CI](https://github.com/qle-bevi/cardiag/actions/workflows/ci.yml/badge.svg)](https://github.com/qle-bevi/cardiag/actions/workflows/ci.yml)

Application de diagnostic automobile locale, développée avec **Rust, Tauri 2, React et TypeScript**. L’objectif est de lire et d’effacer les codes de défaut moteur OBD-II/EOBD des véhicules compatibles.

**État actuel : mode démo fonctionnel dans les builds de développement uniquement.** Activez explicitement la démo depuis l’interface ou au lancement pour connecter un véhicule fictif, lire ses défauts et tester leur effacement avec confirmation. Toutes ces données et opérations sont simulées en Rust. Hors démo, la connexion matérielle reste indisponible : aucun accès au câble, aucun diagnostic réel et aucun effacement matériel ne sont effectués.

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
CARGO_BUILD_JOBS=2 npm run tauri dev
```

Aucun câble ni pilote constructeur n’est nécessaire pour lancer cette version. Le dossier doit être ouvert à la racine du dépôt pour utiliser les commandes documentées.

Sous PowerShell, définir `$env:CARGO_BUILD_JOBS="2"` avant `npm run tauri dev`. Conserver cette limite pour toutes les compilations Rust, sans lancer plusieurs compilations en parallèle. Un précédent BUS ERROR sous WSL reste sans cause établie.

`npm run dev` ouvre uniquement le serveur de développement web. Dans un navigateur, le statut « État de connexion indisponible » est attendu : le service Rust n’y est pas présent.

## Développement et release

La démo est réservée aux builds Rust **debug** (`npm run tauri dev` ou `npm run tauri build -- --debug`). Les vraies releases (`npm run tauri build`, sans `--debug`, ou `tauri dev --release`) masquent les accès et mentions de démo et refusent toutes les commandes du simulateur côté Rust. `CARDIAG_DEMO`, `--demo` et `--no-demo` y sont ignorés, même si la variable contient une valeur invalide.

L’interface interroge le build natif via `get_demo_available` : elle ne déduit pas cette disponibilité du mode Vite. Elle masque la démo tant que cette information n’est pas disponible. Sans prise en charge matérielle, la release affiche les systèmes comme indisponibles et conserve les actions de diagnostic désactivées.

## Choisir le mode démo au lancement en développement

Dans un build debug, les options `--demo` et `--no-demo` activent ou désactivent la démo au démarrage. Elles sont prioritaires sur la variable d’environnement **d’exécution** `CARDIAG_DEMO` (`1` / `true` pour activer, `0` / `false` pour désactiver). Sans option ni variable, la démo est désactivée. Si plusieurs flags sont présents, le dernier l’emporte. Une valeur d’environnement invalide, sans flag prioritaire, empêche le démarrage avec un message sur stderr et le code de sortie 2.

Avec l’exécutable compilé :

```sh
./target/debug/cardiag --demo
./target/debug/cardiag --no-demo
```

En développement (Linux / macOS) :

```sh
CARDIAG_DEMO=1 CARGO_BUILD_JOBS=2 npm run tauri dev
CARDIAG_DEMO=0 CARGO_BUILD_JOBS=2 npm run tauri dev

# Les deux séparateurs après « dev » transmettent le flag à l’application.
CARGO_BUILD_JOBS=2 npm run tauri -- dev -- -- --demo
CARGO_BUILD_JOBS=2 npm run tauri -- dev -- -- --no-demo
```

Sous PowerShell :

```powershell
$env:CARGO_BUILD_JOBS="2"
$env:CARDIAG_DEMO="1" # "0" pour démarrer sans démo
npm run tauri dev

# Ou directement avec le flag :
.\target\debug\cardiag.exe --demo
```

En développement, ces options fixent uniquement l’état initial : la connexion au simulateur et la lecture restent manuelles, et les contrôles de **Démonstration** permettent toujours de changer de mode. La variable est lue par Rust au lancement ; elle ne s’applique pas à `npm run dev` dans un navigateur. Aucun chargement automatique de fichier `.env` n’est ajouté.

## Tester le mode démo

1. Lancer l’application de bureau, puis choisir **Activer le mode démo**. Le bandeau et l’en-tête rappellent que tout est simulé.
2. Choisir **Connecter le véhicule simulé**, ouvrir **Moteur** dans la navigation, puis choisir **Lire les codes**. Trois défauts fictifs `DEMO-001` à `DEMO-003`, avec descriptions françaises, apparaissent après une courte attente.
3. Choisir **Effacer tous les codes moteur**, puis **Annuler** (ou Échap) : les défauts sont conservés. Aucune commande d’effacement n’est envoyée lors de l’annulation.
4. Recommencer et choisir **Confirmer l’effacement simulé**. Le succès invite à une nouvelle lecture ; il ne constitue pas lui-même une lecture sans défaut.
5. Choisir **Lire les codes** : l’application affiche **Aucun défaut relevé dans le véhicule simulé**. Avant toute lecture réussie, elle affiche **Aucune lecture effectuée**.
6. Dans **Démonstration**, **Réinitialiser le scénario** restaure les trois défauts, déconnecte le véhicule et annule tout incident ou travail en attente. Reconnecter et relire pour recommencer.

Dans **Démonstration**, le sélecteur **Incident à la prochaine opération** permet de simuler une **Absence de réponse** ou une **Connexion interrompue**. L’incident est consommé par la prochaine connexion, lecture ou tentative d’effacement confirmée. Les opérations normales prennent environ 500 ms, l’absence de réponse 1 500 ms. Une absence de réponse conserve la connexion préexistante ; une interruption impose une reconnexion. Aucun de ces incidents ne supprime les défauts, même pendant un effacement.

Pendant une opération, les autres actions de diagnostic sont bloquées. Déconnecter, réinitialiser ou quitter la démo interrompt l’opération ; une ancienne réponse ne peut rétablir la connexion ou modifier le nouveau scénario. Une déconnexion conserve l’état des défauts du simulateur, mais retire la lecture affichée. Quitter puis réactiver la démo crée un scénario neuf.

La démo est locale, en mémoire, désactivée au démarrage par défaut et sans sauvegarde entre lancements. Les codes `DEMO-*` sont inventés pour l’interface : ce ne sont pas des codes OBD normalisés ni des résultats de la Skoda Octavia. La démo ne simule aucun protocole électrique, pilote, moniteur de préparation ou calculateur réel. Aucun câble n’est nécessaire ; la compatibilité du GD101 et de l’Octavia reste non vérifiée.

## Interface

Le thème graphite et cyan utilise un en-tête intégré avec les commandes réduire, agrandir/restaurer et fermer. La zone libre de l’en-tête permet de déplacer la fenêtre ; un double-clic agrandit ou restaure. Les commandes natives sont masquées dans le navigateur.

La **Vue d’ensemble** présente la connexion et l’état du diagnostic. La navigation donne accès au **Moteur**, puis à **ABS / freinage**, **Airbags**, **Transmission** et **Carrosserie** : ces quatre systèmes sont visibles mais ne sont pas encore pris en charge. **Démonstration** regroupe les contrôles du simulateur. Changer de page conserve la session.

Dans **Moteur**, sélectionner un défaut affiche son détail. L’action **Effacer tous les codes moteur** reste globale, quelle que soit la sélection. Le composant de détail prévoit une action individuelle future, qui ne sera fournie que si le transport et le calculateur la permettent ; aucune nouvelle commande d’effacement individuel n’est implémentée.

## Commandes

| Commande                                                         | Usage                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------- |
| `npm run tauri dev`                                              | Lancer l’application de bureau avec rechargement           |
| `npm run build`                                                  | Vérifier TypeScript et compiler l’interface                |
| `npm test`                                                       | Tester le contrat IPC et le parcours démo                  |
| `npm run format:check`                                           | Vérifier le formatage des fichiers web et de documentation |
| `cargo fmt --all -- --check`                                     | Vérifier le formatage Rust                                 |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Analyser le code Rust                                      |
| `cargo test --workspace --locked`                                | Tester le code Rust, application comprise                  |
| `cargo test -p diagnostic-core --locked`                         | Tester uniquement le domaine, sans GTK ni WebKit           |
| `npm run tauri build -- --no-bundle -- --locked`                 | Compiler l’exécutable de bureau sans installateur          |

Exécuter `npm run build` avant les vérifications Rust de l’ensemble du workspace pour fournir les ressources de l’interface. Les exécutables sont produits dans `target/release/` (`cardiag.exe` sous Windows). Les installateurs signés et les publications de versions ne sont pas configurés dans ce jalon.

## Architecture

- `src/` : interface React en français, validation du contrat IPC et protection contre les réponses obsolètes.
- `src-tauri/` : application de bureau et adaptateur IPC. `get_session` consulte la session ; `run_demo_action` reçoit une action et la génération attendue. Les délais simulés sont exécutés hors du thread graphique, sans garder le verrou de session pendant l’attente.
- `crates/diagnostic-core/` : domaine Rust portable, indépendant de Tauri et du système d’exploitation. `DiagnosticTransport` définit connexion, déconnexion, lecture et effacement ; `Simulator` l’implémente. `DemoSession` gère les transitions, incidents, confirmations et tickets d’opération.

Un jeu de données partagé dans `tests/fixtures/` vérifie la cohérence du contrat Rust/TypeScript. Les futurs transports matériels seront placés dans des crates séparées, derrière l’abstraction de transport du domaine. Les bindings J2534 et le chargement des DLL Windows ne devront pas entrer dans l’interface React ni dans le domaine portable.

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
