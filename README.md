# Namu — portage Angular PWA

Le portage vise l’interface et les comportements de l’APK fourni, avec suppression de la synchronisation MediBang et des publicités. La première interface « atelier » a été remplacée par les écrans sombres d’origine, leurs icônes, les 82 tampons, les repères et l’exemple de cinq pages. Les libellés reprennent la version anglaise de l’APK.

Le dossier est autonome et peut être publié directement comme dépôt GitHub. Le workflow `.github/workflows/deploy-pages.yml` construit puis déploie automatiquement la PWA sur GitHub Pages à chaque push sur `main`.

La fidélité complète reste en cours de vérification. Le système Android fournit ses propres barres de statut et de navigation ; elles ne sont pas dessinées dans la page web.

## Démarrer

Node.js 24 et npm sont nécessaires.

```bash
npm ci
npm start
```

Pour la PWA avec cache hors ligne :

```bash
npm run build
npm run preview
```

Ouvrir **http://localhost:4388/**. Laisser le premier chargement se terminer pour que le service worker mette le shell, les polices et les icônes locales en cache. Les tampons sont chargés et mis en cache à la demande afin d’alléger le premier démarrage. Le serveur d’aperçu écoute uniquement sur la machine locale. Le site n’est pas publié.

Le script de compilation désactive le cache Angular et limite ses workers pour éviter le plantage du compilateur constaté dans cet environnement.

## Écrans et édition

- Liste des brouillons sur l’appareil, création, renommage et suppression.
- Grille de pages avec lecture droite-gauche, gauche-droite ou verticale ; doubles pages, repères, copie, réorganisation et suppression.
- Canevas de 1000 × 1414, crayon, gomme, ligne, rectangle, texte, tampons et lasso.
- Barre flottante déplaçable et orientable, plein écran, annuler/rétablir, zoom/déplacement/rotation à deux doigts.
- Texte local rééditable, déplaçable et supprimable ; choix de la taille et du sens vertical.
- Tampons : miroir, déplacement, taille et rotation. Sélection au lasso : découpe, déplacement, miroir et déformation.
- Autosauvegarde après 3,5 secondes d’inactivité, avec état visible « Autosave pending », « Saving… » ou « Saved » ; le bouton Save reste disponible pour enregistrer immédiatement. Quitter un dessin encore modifié affiche la confirmation d’origine.
- Installation PWA depuis les navigateurs compatibles et bannière lorsqu’une nouvelle version est disponible.
- Export PNG ; plusieurs images sont regroupées dans une archive ZIP. Le partage utilise la fonction du navigateur lorsqu’elle existe.

Le rendu de texte distant a été remplacé par un rendu Canvas local en Noto Sans. Il n’effectue aucune requête MediBang. L’interface utilise les fichiers Roboto extraits du système Android 12 de référence. Les licences des polices sont incluses dans `public/fonts/`.

## Stockage

Les brouillons sont enregistrés dans IndexedDB, base `manganame-device`, pour l’adresse et le navigateur utilisés. Utiliser la même origine : `localhost` et `127.0.0.1` ont des stockages distincts. Effacer les données du site efface ses brouillons.

Les dessins créés dans l’ancien prototype sont récupérés une fois depuis `manganame-atelier`, sous forme de pages rasterisées. La base d’origine reste inchangée ; le texte du prototype est donc conservé dans l’image récupérée, sans devenir un nouveau texte rééditable. L’exemple inventé et non modifié du prototype reste uniquement dans l’ancienne base. La sauvegarde de son ancien code se trouve dans `../.cache/pwa-prototype-archive/`.

Les exports PNG/ZIP sont des images, pas une sauvegarde éditable du format Android Realm. L’import/export natif Realm n’est pas implémenté.

## Vérifier

```bash
npm test -- --watch=false
npm run build
npm run test:e2e
```

Les tests E2E utilisent un profil Chromium isolé et leur propre serveur sur le port 4387. Ils vérifient les pixels du dessin, annuler/rétablir, gomme, abandon des modifications, sauvegarde après rechargement, texte rééditable, lasso, tampons, grille, repères, copie, réorganisation, exports PNG/ZIP, récupération du prototype, gestes tactiles et fonctionnement hors ligne sans requête tierce.

Les captures de référence PWA sont recréées par ces tests. Les traces d’échec sont dans `test-results/`. Le rapport de fidélité est dans `reports/pwa-parity.md` lorsqu’il est inclus dans le dépôt.

## Limites encore à vérifier

La reproduction de chaque écran au pixel près n’est pas encore certifiée. Le rendu de texte Canvas, les menus système, le clavier, la reconnaissance vocale et le partage dépendent du navigateur ; leur rendu ou disponibilité peut différer d’Android. Les touches de volume ne peuvent être traitées que si le navigateur transmet les événements correspondants. L’application ne lit pas les fichiers Realm de l’APK.

Aucun lien de synchronisation, connexion de compte, publicité, télémétrie ou bibliothèque MediBang n’est intégré à la PWA.
