# 🔄 Migrations en cours — code à retirer une fois périmé

Ce fichier liste le code de transition encore en place : ce qu'il fait, **pourquoi il
n'est pas encore retirable**, et la condition précise qui autorisera sa suppression.
Une migration terminée dont le code traîne indéfiniment finit par être supprimée par
quelqu'un qui n'en connaît plus les raisons — d'où cette page.

---

## Identifiants de projet : `zappy` → `42-2295`

**Fait le 2026-09-10.** Le référentiel RNCP et le Holy Graph parlaient deux langues :
des identifiants écrits à la main (`zappy`, `libft`) d'un côté, ceux de 42 (`42-1463`)
de l'autre. Tout est passé aux identifiants 42.

Bénéfice principal : `GRAPH_PROJECT_ID_RE` accepte déjà `^42-\d+$`, donc retirer un
projet du référentiel n'invalide plus son identifiant. Toute une famille de bugs
disparaît par construction.

### État

| Environnement | Migré le | Résultat |
|---|---|---|
| pre-prod | 2026-09-10 | 273 lignes · 270 traduites · 3 déjà bonnes · 2 blobs (3 piscines, 15 modules) |
| **prod** | **2026-09-10** | **identique : 273 / 270 / 3 / 2 blobs** — 0 inconnu, 0 collision |

La migration tourne au **démarrage du serveur** (`server.ts`), pas via un script : l'image
de production ne contient ni `scripts/`, ni `src/`, ni `tsx`. Elle est idempotente — aux
démarrages suivants elle affiche « à traduire : 0 » et ne touche à rien.

### Ce qui reste en place, et pourquoi

**1. `backend/srcs/src/data/legacyProjectIds.ts` — NE PAS RETIRER pour l'instant.**

Ce n'est pas seulement de la migration. `toCurrentProjectId` est appelé à trois endroits
de `simulationRepository.ts`, **sur le chemin de sauvegarde**. Un onglet resté ouvert
depuis avant la bascule envoie encore les anciens identifiants ; sans cette traduction,
ses projets seraient écartés **et les lignes déjà migrées supprimées** — la sauvegarde
est un remplacement, donc ce que le client n'envoie pas est effacé.

Le `localStorage` se répare seul (le Dashboard le réécrit depuis le serveur à chaque
chargement), mais un onglet ouvert de longue date garde ses anciens identifiants en
mémoire vive.

**2. `backend/srcs/src/services/projectIdMigration.service.ts` + son appel dans
`server.ts` — retirable sur le principe, mais le gain est nul.**

La base est convertie. Ce qui reste utile : toute base repartant d'un **dump ancien**
arriverait non migrée. C'est le cas de `save/prod-calculatorgcc-20260910-1857.sql.gz`,
pris juste avant la bascule et donc en ancien format — le restaurer sans la migration
donnerait une base que l'application ne comprend plus. Même situation pour un
environnement de dev ou une pre-prod qui clonerait un vieux backup.

### Quand retirer

Quand ces deux conditions sont réunies :

1. **Plus aucun client n'envoie d'ancien identifiant.** Pour le savoir sur des faits
   plutôt qu'au jugé, instrumenter `toCurrentProjectId` (un log quand il traduit
   réellement). Rien pendant deux semaines ⇒ plus aucune session ancienne.
2. **Plus aucun dump d'avant le 2026-09-10 ne sert de sauvegarde de référence** — c'est
   à dire qu'un dump plus récent l'a remplacé.

### Checklist de suppression

- [ ] `backend/srcs/src/data/legacyProjectIds.ts` (fichier entier)
- [ ] `backend/srcs/src/services/projectIdMigration.service.ts` (fichier entier)
- [ ] `backend/srcs/scripts/migrateProjectIds.ts` (fichier entier)
- [ ] `backend/srcs/src/server.ts` : l'import et le bloc `try { await migrateProjectIds(true) }`
- [ ] `backend/srcs/src/db/simulationRepository.ts` : l'import et les **3** appels à
      `toCurrentProjectId` (projet, piscine parente, sous-projet)
- [ ] Vérifier : `grep -rn "toCurrentProjectId\|LEGACY_PROJECT_IDS\|migrateProjectIds" backend/srcs`
      ne doit plus rien renvoyer

---

## Collision d'alias de base de données

**Corrigé le 2026-09-10** (`2373720`, `311c240`) — pour mémoire, rien à retirer.

Compose **ajoute** le nom du service comme alias sur chaque réseau, sans jamais
remplacer celui qu'on déclare. Les deux stacks exposaient donc chacune un hôte nommé
`mariadb` sur le réseau partagé `coolify`, et le DNS Docker en désignait un au hasard :
la prod s'est mise à interroger la base de la pre-prod et est tombée (P1000, mots de
passe différents).

Le clone (`docker-entrypoint.sh`) commence par un `DROP DATABASE` sur `TARGET_DB_HOST`
— le tirage aurait pu se faire dans l'autre sens. Seule la divergence des mots de passe
root l'a évité.

Deux verrous désormais : plus personne ne joint la base par son nom de service
(`DB_SHARED_ALIAS`, obligatoire et distinct par environnement), et le clone refuse de
partir si source et cible désignent le même serveur (comparaison de `@@hostname`, pas
des noms ni des IP résolues — sur un réseau partagé, ceux-là ne prouvent rien).

**Invariant à ne pas casser** : `DB_SHARED_ALIAS` doit rester **différent** d'un
environnement à l'autre. Le compose échoue au déploiement s'il est absent ; il ne peut
pas détecter qu'il est identique ailleurs.
