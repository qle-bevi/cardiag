# Validation du mode démo

## Automatisation

La CI exécute le formatage, les tests de l’interface et la compilation TypeScript. Elle vérifie aussi le formatage Rust, Clippy, les tests du workspace et la compilation Tauri sur Windows, Ubuntu et macOS. `CARGO_BUILD_JOBS=2` limite les compilations Rust ; aucun câble n’est nécessaire.

Les tests Rust couvrent le simulateur déterministe, les transitions autorisées/refusées, la confirmation obligatoire, la relecture après effacement, la reconnexion, la réinitialisation, les incidents à usage unique sur chaque opération et le rejet des tickets obsolètes. Les mutations sont appliquées seulement à l’achèvement d’un ticket encore valide.

Les tests React avec IPC simulé couvrent le parcours, l’annulation (bouton et événement Échap), la confirmation, les états de chargement, les erreurs, le blocage des actions concurrentes et les réponses tardives après interruption, y compris pendant une nouvelle lecture. Ils couvrent aussi le démontage et StrictMode. Les fixtures JSON partagées vérifient le contrat entre Rust et TypeScript. Les tests jsdom ne remplacent pas le contrôle du focus et de la fenêtre modale dans une WebView native.

## Vérification manuelle du lancement et du parcours

1. Exécuter `npm ci`, définir `CARGO_BUILD_JOBS=2`, puis lancer `npm run tauri dev`.
2. Vérifier l’ouverture de « Cardiag », l’état « Connexion matérielle non disponible » et les actions de diagnostic désactivées.
3. Activer la démo et vérifier la mention permanente « Mode démo · Tout est simulé », y compris après défilement.
4. Connecter le véhicule fictif. Avant la première lecture, vérifier « Aucune lecture effectuée » ; lire et vérifier les trois défauts `DEMO-*`.
5. Ouvrir la confirmation d’effacement. Vérifier que le focus commence sur « Annuler », que Tab reste dans la boîte de dialogue et qu’Échap conserve les défauts. Refaire avec le bouton « Annuler ».
6. Confirmer l’effacement et vérifier le chargement puis l’invitation à relire. Relire et constater l’absence de défauts simulés. Déconnecter/reconnecter et vérifier que les défauts ne réapparaissent pas.
7. Réinitialiser : le véhicule est déconnecté. Reconnecter et relire les trois défauts initiaux.
8. Armer chaque incident, puis lancer une lecture : vérifier l’erreur, l’absence de faux résultat vide et le retour à un fonctionnement normal à l’essai suivant (reconnexion nécessaire après interruption). Refaire sur connexion et effacement.
9. Pendant une lecture ou un effacement, réinitialiser ou déconnecter. Attendre la durée de l’ancienne opération : elle ne doit restaurer aucun état. Une réinitialisation pendant l’effacement doit conserver les trois défauts initiaux après reconnexion/relecture.
10. Quitter la démo et vérifier le retour à la connexion matérielle indisponible. Réactiver pour retrouver un scénario neuf.
11. Réduire la fenêtre à sa taille minimale et vérifier la lisibilité, le défilement et l’accès aux commandes. Fermer l’application et vérifier son arrêt.

Le contrôle visuel natif sous Windows et macOS reste à effectuer sur les postes cibles. La CI compile l’application mais ne remplace pas cette vérification graphique. Un précédent BUS ERROR sous WSL reste sans cause établie ; éviter les compilations Rust simultanées.

## Essais matériels

Non effectués et non disponibles. Le GD101 et la Skoda Octavia diesel de 2005 restent des cibles de test, sans garantie de compatibilité. Les résultats futurs devront préciser le système, l’architecture et la version du pilote, le véhicule et le protocole effectivement utilisés.
