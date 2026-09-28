# Namu — état de parité PWA

Le portage reprend les écrans de l’APK, la grille RTL/LTR/TTB, l’édition 1000 × 1414, le texte local, les 82 tampons, le lasso, la sauvegarde manuelle, l’export PNG/ZIP et le stockage IndexedDB. La synchronisation MediBang, les publicités et le rendu texte distant sont supprimés.

Les tests unitaires et les parcours E2E Chromium/WebKit sont exécutés avant publication. Les différences restantes concernent les éléments rendus par le système Android (clavier, menus, partage, voix, touches de volume), la rasterisation de certains glyphes japonais et l’import/export Realm.
