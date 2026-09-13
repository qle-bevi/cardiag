# Cardiag

[![CI](https://github.com/qle-bevi/cardiag/actions/workflows/ci.yml/badge.svg)](https://github.com/qle-bevi/cardiag/actions/workflows/ci.yml)

Application de diagnostic automobile locale, développée avec **Rust, Tauri 2, React et TypeScript**. L’objectif est de lire et d’effacer les codes de défaut moteur OBD-II/EOBD des véhicules compatibles.

**État actuel : premier transport matériel J2534 implémenté pour Windows, en lecture seule, sans validation sur véhicule.** Cardiag recherche les pilotes installés, ouvre le câble et confirme le profil proposé par une réponse OBD. La lecture couvre les défauts mémorisés et en attente, avec leur calculateur d’origine. Le premier profil proposé est ISO 15765, CAN 11 bits à 500 kbit/s ; aucune détection universelle de protocole n’est implémentée. Le GD101 et l’Octavia restent à tester ensemble.

Le mode démo reste disponible dans les builds de développement uniquement. Il fonctionne sans câble et permet toujours de tester l’effacement simulé. L’effacement matériel est absent de l’interface et refusé côté Rust.

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

Aucun câble ni pilote constructeur n’est nécessaire pour lancer l’application ou la démo. Le diagnostic réel nécessite Windows et le pilote J2534 du fabricant. Le dossier doit être ouvert à la racine du dépôt pour utiliser les commandes documentées.

Sous PowerShell, définir `$env:CARGO_BUILD_JOBS="2"` avant `npm run tauri dev`. Conserver cette limite pour toutes les compilations Rust, sans lancer plusieurs compilations en parallèle. Un précédent BUS ERROR sous WSL reste sans cause établie.

`npm run dev` ouvre uniquement le serveur de développement web. Dans un navigateur, le statut « État de connexion indisponible » est attendu : le service Rust n’y est pas présent.

## Lancer la version Windows depuis WSL

Depuis la racine du projet dans WSL :

```sh
./scripts/windows.sh
# Ou : npm run windows
```

Le script trouve automatiquement ton profil Windows, synchronise les sources actuelles (y compris les modifications non commitées) vers une copie dédiée sous `%LOCALAPPDATA%\Cardiag\wsl-<identifiant>`, installe les dépendances Windows si nécessaire, puis lance l’application avec les outils Windows. Les auxiliaires J2534 x86/x64 sont préparés par le lancement Tauri habituel. La première compilation peut prendre plusieurs minutes.

```sh
./scripts/windows.sh --demo       # Démarrer avec la démo activée
./scripts/windows.sh --check      # Vérifier les outils sans copier ni compiler
./scripts/windows.sh --prepare    # Copier et installer les dépendances uniquement
./scripts/windows.sh --sync-only  # Copier uniquement les sources
```

Rust/rustup, Node.js 24, npm, les Build Tools C++ x86/x64 et WebView2 doivent être installés côté Windows, ainsi que le pilote Godiag pour le diagnostic réel. Le script vérifie les commandes et la présence des outils C++ ; la vérification finale du SDK et de WebView2 reste effectuée par la compilation et le lancement. Il utilise les versions Windows installées et ne modifie pas les installations globales. Sous WSL, il nécessite `rsync` (`sudo apt install rsync` si absent).

La synchronisation conserve `node_modules`, `target`, `dist`, les journaux et les caches de cette copie Windows. Les sources supprimées dans WSL sont également supprimées dans la copie dédiée. **Modifie les fichiers dans WSL** : la copie Windows sert uniquement à l’exécution. Arrête le lancement avec Ctrl+C, puis relance le script pour synchroniser les changements ; il n’y a pas de synchronisation continue. Un verrou empêche deux lancements simultanés par ce script pour la même copie.

## Développement et release

La démo est réservée aux builds Rust **debug** (`npm run tauri dev` ou `npm run tauri build -- --debug`). Les vraies releases (`npm run tauri build`, sans `--debug`, ou `tauri dev --release`) masquent les accès et mentions de démo et refusent toutes les commandes du simulateur côté Rust. `CARDIAG_DEMO`, `--demo` et `--no-demo` y sont ignorés, même si la variable contient une valeur invalide.

L’interface interroge le build natif via `get_demo_available` : elle ne déduit pas cette disponibilité du mode Vite. Elle masque la démo tant que cette information n’est pas disponible. Sous Windows, la release propose la connexion J2534 et la lecture OBD/EOBD. Sous Linux/macOS, la connexion matérielle reste indisponible. Les autres systèmes sont indisponibles sur toutes les plateformes.

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

Un jeu de données partagé dans `tests/fixtures/` vérifie la cohérence du contrat Rust/TypeScript. `crates/j2534/` contient le décodeur OBD, la découverte des pilotes et le processus auxiliaire J2534. Les DLL sont chargées dans cet auxiliaire, jamais dans React ni dans le domaine portable. `src-tauri/` possède une session matérielle distincte du simulateur, une génération commune et une seule opération matérielle en cours. `crates/fake-j2534/` fournit exclusivement une bibliothèque de test, jamais distribuée avec l’application.

L’application charge uniquement ses ressources locales, sans compte, serveur distant ni télémétrie. Aucun pilote constructeur n’est distribué dans ce dépôt.

## Matériel et compatibilité

Le premier câble prévu est le **GO-DIAG GD101**. Sa [fiche produit](https://godiag.com/products/godiag-gd101-j2534-passthru-diagnostic-cable-for-ford-mazda-honda-toyota-renault-forscan-scanmaster-sdd-pcm-flash-elm327-j1979) annonce J2534 et une émulation ELM327. Ces annonces ne constituent pas une validation avec Cardiag.

Premier véhicule prévu : **Skoda Octavia II 1Z diesel, 2005**, génération confirmée par le propriétaire. La motorisation précise reste inconnue. Le diagnostic CAN du châssis est [documenté par Ross-Tech](https://fr.ross-tech.com/canbus.htm) ; le profil OBD proposé et la compatibilité avec Cardiag restent à valider sur le véhicule.

| Système | Application                                                         | GD101 / diagnostic réel          |
| ------- | ------------------------------------------------------------------- | -------------------------------- |
| Windows | Première cible véhicule ; transport vérifié par compilation croisée | Lecture implémentée, non validée |
| Linux   | Compilation vérifiée par CI                                         | Accès au matériel à étudier      |
| macOS   | Compilation vérifiée par CI                                         | Accès au matériel à étudier      |

Une compilation réussie ne valide ni l’accès au câble ni la compatibilité d’un véhicule. Le [suivi de validation](docs/validation.md) distingue compilation, lancement graphique et essais matériels.

## Lire les défauts avec le GD101 sous Windows

1. Installer le pilote J2534 depuis le fabricant, puis brancher le GD101 en USB et sur le véhicule, contact mis.
2. Lancer Cardiag hors démo. Choisir l’interface installée ; **Actualiser** relit le registre. Une interface listée signifie qu’un pilote est enregistré, pas que le câble ou la voiture répond.
3. Choisir **Connecter le véhicule**. Le profil n’est affiché comme connecté qu’après une réponse valide à `01 00` ; l’ouverture USB seule ne suffit pas.
4. Ouvrir **Moteur**, puis **Lire les codes**. Les services `03` et `07` lisent les défauts mémorisés et en attente. Chaque résultat conserve sa source (`0x7E8`…`0x7EF`) : plusieurs calculateurs OBD peuvent répondre, sans attribution automatique au moteur.
5. Consulter le détail d’un code. Les libellés non documentés restent **Description non disponible**. Une lecture partielle est signalée, y compris si aucun code n’a pu être affiché ; une absence de réponse ne devient jamais un résultat sans défaut.
6. **Déconnecter** ferme la session. Une reconnexion est nécessaire après interruption. En développement, activer la démo ferme également la connexion matérielle et invalide les réponses tardives.

Le premier profil est fixe : CAN 11 bits, 500 kbit/s, ISO 15765, requêtes fonctionnelles `0x7DF`, réponses `0x7E8` à `0x7EF`. Les filtres de contrôle de flux sont installés pour ces huit adresses ; J2534 assure le découpage et le réassemblage ISO-TP. Chaque requête a une fenêtre de réponse de 3 secondes ; une opération auxiliaire dépassant 15 secondes est interrompue. Une absence de réponse ne prouve pas que le véhicule ne prend pas en charge le CAN.

La lecture ne couvre ni tous les défauts constructeur, ni l’ABS, les airbags ou les autres systèmes. Aucun effacement réel, codage, réglage, reprogrammation, balayage de protocoles, collecte de VIN ou lecture continue des capteurs n’est proposé.

### Auxiliaires et pilotes

Sous Windows, les commandes Tauri lancent `scripts/native.mjs` avant le serveur web ou la compilation. Le script prépare les auxiliaires MSVC x86 et x64 avec `CARGO_BUILD_JOBS=2`, puis les copie dans les ressources et près des exécutables de développement/release. Les composants C++ x86/x64 des Build Tools sont nécessaires. Les installateurs incluent les auxiliaires, mais aucun pilote constructeur.

La découverte consulte les deux vues du registre `HKLM\SOFTWARE\PassThruSupport.04.04` et le champ `FunctionLibrary`. Le champ machine du fichier PE détermine l’architecture de l’auxiliaire lorsqu’il est lisible. Le frontend transmet uniquement l’identifiant d’une interface enregistrée, jamais un chemin de DLL ou une commande automobile brute.

Un journal local `j2534-session.log` est placé dans le dossier de journaux de l’application, sous `%LOCALAPPDATA%\io.github.qle-bevi.cardiag\logs` sous Windows. Il est remplacé à chaque connexion et limité en taille ; il contient les commandes, résultats et des extraits bornés des échanges OBD. Il n’est jamais envoyé automatiquement.

### Tests du transport sans câble

```sh
CARGO_BUILD_JOBS=2 cargo build -p fake-j2534 --locked
CARGO_BUILD_JOBS=2 cargo test -p cardiag-j2534 --test helper --locked -- --include-ignored
```

Cette suite charge une bibliothèque factice dans le véritable auxiliaire et vérifie l’ABI, les filtres, plusieurs calculateurs, la lecture vide/partielle, l’absence de réponse, les erreurs et un pilote qui plante ou se bloque. Elle est ignorée par défaut car elle nécessite de compiler la bibliothèque factice ; la CI l’exécute explicitement, ainsi qu’une version x86 sous Windows. Les tests factices ne valident pas le GD101 réel.

## Prochaines étapes

1. **Essai Windows et véhicule** : vérifier le pilote et les deux architectures, confirmer la communication OBD sur l’Octavia et comparer les résultats avec un outil de référence compatible. Suivre [la procédure de validation](docs/validation.md).
2. **Adapter le profil si nécessaire** à partir des réponses observées et de la référence du calculateur.
3. **Effacement moteur** : jalon ultérieur après validation de la lecture, avec confirmation et explication des effets.
4. **Autres calculateurs et plateformes** : intégrations distinctes à étudier après le moteur.

## Licence

[MIT](LICENSE).
