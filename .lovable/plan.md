# Corriger définitivement le live swap noir

## Diagnostic confirmé
- La clé et la création de session Decart fonctionnent.
- La connexion temps réel et l’envoi de l’avatar réussissent.
- Les mesures Decart montrent `bytesSent: 0`, `framesPerSecond: 0` et aucune vidéo reçue : la piste caméra visible localement n’est pas encodée vers Decart.
- L’application affiche actuellement « LIVE » dès que la connexion est ouverte, avant qu’une première image transformée existe, puis facture cette fausse session.

## Corrections
1. Capturer la caméra avec les dimensions et la cadence exactes fournies par le modèle Lucy 2.5, puis attendre que la piste soit réellement active avant la connexion.
2. Retirer le codec VP8 imposé afin d’utiliser le codec H.264 recommandé par le SDK Decart sur mobile.
3. Ne passer à « LIVE » et ne commencer le compteur/facturation qu’après réception et rendu de la première image transformée.
4. Ajouter un délai de démarrage contrôlé : si aucune image n’arrive, arrêter proprement, afficher une erreur utile et ne débiter aucun point.
5. Ajouter une annulation sécurisée côté serveur pour clôturer les tentatives sans rendu sans les facturer.
6. Conserver la facturation normale uniquement après un rendu réellement démarré.

## Vérification
- Vérifier la compilation et les erreurs d’exécution.
- Tester l’ouverture caméra, le démarrage, l’état d’attente et l’arrêt sans résultat.
- Le test final avec une vraie transformation Decart devra être relancé depuis votre appareil, car la caméra physique et votre clé active ne sont pas disponibles dans le navigateur automatisé.
