# Validation de l’interface et du mode démo

## Automatisation

La CI exécute le formatage, les tests de l’interface et la compilation TypeScript. Elle vérifie aussi le formatage Rust, Clippy, les tests du workspace et la compilation Tauri sur Windows, Ubuntu et macOS. `CARGO_BUILD_JOBS=2` limite les compilations Rust ; aucun câble n’est nécessaire.

Les tests Rust couvrent le simulateur déterministe, les transitions autorisées/refusées, la confirmation obligatoire, la relecture après effacement, la reconnexion, la réinitialisation, les incidents à usage unique sur chaque opération et le rejet des tickets obsolètes. Les mutations sont appliquées seulement à l’achèvement d’un ticket encore valide.

Les tests React avec IPC simulé couvrent le parcours, l’annulation (bouton et événement Échap), la confirmation, les états de chargement, les erreurs, le blocage des actions concurrentes et les réponses tardives après interruption, y compris pendant une nouvelle lecture. Ils couvrent aussi le démontage et StrictMode. Les fixtures JSON partagées vérifient le contrat entre Rust et TypeScript. Les tests jsdom ne remplacent pas le contrôle du focus et de la fenêtre modale dans une WebView native.

## Vérification manuelle du lancement et du parcours

1. Exécuter `npm ci`, définir `CARGO_BUILD_JOBS=2`, puis lancer `npm run tauri dev`.
2. Vérifier l’ouverture de « Cardiag », l’état « Connexion matérielle non disponible » et les actions de diagnostic désactivées.
3. Activer la démo et vérifier la mention permanente « Mode démo · Tout est simulé », y compris après défilement.
4. Connecter le véhicule fictif, puis ouvrir **Moteur**. Avant la première lecture, vérifier « Aucune lecture effectuée » ; lire et vérifier les trois défauts `DEMO-*`.
5. Ouvrir la confirmation d’effacement. Vérifier que le focus commence sur « Annuler », que Tab reste dans la boîte de dialogue et qu’Échap conserve les défauts. Refaire avec le bouton « Annuler ».
6. Confirmer l’effacement et vérifier le chargement puis l’invitation à relire. Relire et constater l’absence de défauts simulés. Déconnecter/reconnecter et vérifier que les défauts ne réapparaissent pas.
7. Dans **Démonstration**, réinitialiser : le véhicule est déconnecté. Reconnecter et relire les trois défauts initiaux.
8. Dans **Démonstration**, armer chaque incident, puis lancer une lecture : vérifier l’erreur, l’absence de faux résultat vide et le retour à un fonctionnement normal à l’essai suivant (reconnexion nécessaire après interruption). Refaire sur connexion et effacement.
9. Pendant une lecture ou un effacement, réinitialiser ou déconnecter. Attendre la durée de l’ancienne opération : elle ne doit restaurer aucun état. Une réinitialisation pendant l’effacement doit conserver les trois défauts initiaux après reconnexion/relecture.
10. Dans **Démonstration**, quitter la démo et vérifier le retour à la connexion matérielle indisponible. Réactiver pour retrouver un scénario neuf.
11. Réduire la fenêtre à sa taille minimale et vérifier la lisibilité, le défilement et l’accès aux commandes. Fermer l’application et vérifier son arrêt.

Le contrôle visuel natif sous Windows et macOS reste à effectuer sur les postes cibles. La CI compile l’application mais ne remplace pas cette vérification graphique. Un précédent BUS ERROR sous WSL reste sans cause établie ; éviter les compilations Rust simultanées.

## Refonte graphite et cyan

Les tests React vérifient aussi la navigation sans nouvelle commande de diagnostic, les pages de systèmes indisponibles, la sélection d’un défaut, l’invalidation du détail après relecture/déconnexion et la portée globale de l’effacement malgré une sélection. Les tests de l’en-tête utilisent des mocks Tauri pour vérifier les commandes, l’état agrandi/restauré, le nettoyage de l’écoute de redimensionnement et les erreurs.

Contrôle visuel effectué dans Chromium sous Linux aux tailles **1100 × 760** et **640 × 580**, avec IPC simulé pour parcourir la démo. La vue d’ensemble, le moteur avec détail, les systèmes indisponibles et les contrôles de démonstration ne présentent pas de débordement horizontal. Vérification clavier effectuée sur la confirmation : focus initial sur Annuler, maintien du focus dans le dialogue avec Tab/Maj+Tab, fermeture par Échap et retour au bouton d’effacement. Aucun échec JavaScript observé durant ce parcours. Ce contrôle navigateur ne valide pas les commandes natives.

Compilation Tauri **debug** réussie sous Linux/WSL avec `CARGO_BUILD_JOBS=2 npm run tauri build -- --debug --no-bundle --ci -- --locked`. Lancement graphique vérifié sous X11 : thème sombre, absence de barre de titre système et présence des trois commandes intégrées. Les tentatives d’automatisation des interactions de fenêtre sous WSL n’ont pas permis de valider leur comportement réel ; les appels Tauri sont couverts par les tests avec mocks.

Sur les postes cibles, vérifier encore : déplacement par la zone libre de l’en-tête, double-clic pour agrandir/restaurer, réduction, fermeture, redimensionnement par les bords et maintien de l’accès aux trois commandes à la taille minimale. Vérifier également les contrastes et le focus dans la WebView native, avec les paramètres de mise à l’échelle du système.

## Essais matériels

Non effectués et non disponibles. Le GD101 et la Skoda Octavia diesel de 2005 restent des cibles de test, sans garantie de compatibilité. Les résultats futurs devront préciser le système, l’architecture et la version du pilote, le véhicule et le protocole effectivement utilisés.

## Démo réservée au développement

La disponibilité provient du build Rust (`debug_assertions`), via la commande `get_demo_available`. Les tests frontend couvrent les deux réponses natives avec les mêmes composants : démo disponible en debug, aucun accès ni mention de démo dans les pages de release, absence d’apparition transitoire pendant le chargement et rejet des réponses malformées.

La CI exécute aussi `cargo test -p cardiag --locked --config 'profile.dev.package.cardiag.debug-assertions=false'`. Cette commande compile le code conditionnel de release du paquet applicatif sans imposer une recompilation optimisée de toutes les dépendances. Elle vérifie notamment que chaque action de simulation est refusée par le gestionnaire IPC de release. Les tests du démarrage vérifient que flags et variable d’environnement, y compris invalides, ne peuvent pas activer la démo lorsque celle-ci est indisponible. La compilation Tauri optimisée reste assurée par l’étape de build de la CI.
