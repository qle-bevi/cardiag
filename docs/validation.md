# Validation du socle

## Automatisation

La CI exécute le formatage, les tests de l’interface et la compilation TypeScript. Elle vérifie aussi le formatage Rust, Clippy, les tests du workspace et la compilation de l’application Tauri sur Windows, Ubuntu et macOS. Aucun câble n’est nécessaire.

Les tests couvrent le contrat JSON partagé, l’attente de réponse, l’état déconnecté et l’échec du service. Les boutons de diagnostic restent désactivés dans chacun de ces états ; un clic ne déclenche aucune commande matérielle.

## Vérification manuelle du lancement

Sur chaque poste disposant des prérequis :

1. Exécuter `npm ci`, puis `npm run tauri dev`.
2. Vérifier l’ouverture de la fenêtre « Cardiag » et l’affichage de « Aucun véhicule connecté » après la vérification initiale.
3. Vérifier que « Lire les codes » et « Effacer les codes » sont désactivés.
4. Réduire la fenêtre à sa taille minimale et vérifier que les textes et commandes restent lisibles.
5. Fermer la fenêtre et vérifier l’arrêt normal du programme.

Le contrôle visuel natif sous Windows et macOS reste à effectuer sur les postes cibles. La CI compile l’application mais ne remplace pas cette vérification graphique.

## Essais matériels

Non effectués et non disponibles dans ce socle. Le GD101 et la Skoda Octavia diesel de 2005 restent des cibles de test, sans garantie de compatibilité. Les résultats futurs devront préciser le système, l’architecture et la version du pilote, le véhicule et le protocole effectivement utilisés.
