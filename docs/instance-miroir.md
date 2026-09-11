# Héberger une instance miroir

Comment faire tourner CalculatorGCC sur un second serveur (l'intranet de
l'école, par exemple) **sans dupliquer la base de données**.

L'instance miroir tourne normalement, mais son backend relaie les routes
applicatives vers l'instance principale : celle-ci reste la seule à détenir les
données, les secrets 42 et les comptes. Rien n'est synchronisé, donc rien ne
peut diverger. Le réglage s'active à chaud depuis le panneau admin du miroir,
sans reconstruire ni redéployer.

```
  Instance principale (theomouty.fr)      Instance miroir (école)
  ┌──────────────────────────────┐        ┌───────────────────────────┐
  │ nginx + frontend             │        │ nginx + frontend          │
  │ backend  ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─┤ backend (relais seulement)│
  │ MariaDB (toutes les données) │  HTTPS │ MariaDB (admin local)     │
  └──────────────────────────────┘        └───────────────────────────┘
```

## Ce qu'il faut faire, dans l'ordre

### 1. Autoriser l'origine (instance principale)

Panneau admin → **Origines autorisées** → ajouter le domaine du miroir, par
exemple `https://calculator.42nice.fr`.

Cette liste commande deux choses :

- **CORS** : sans elle, le navigateur du miroir se voit refuser l'API en
  production ;
- **le retour de connexion 42** : le backend ne renvoie l'utilisateur sur un
  domaine que s'il y figure.

Une révocation prend effet immédiatement, sans redéploiement.

### 2. Ne rien changer côté application 42

Sur <https://profile.intra.42.fr/oauth/applications>, l'application garde
**une seule** `redirect_uri` : celle de l'instance principale
(`https://theomouty.fr/api/auth/callback`). C'est toujours ce backend qui
échange le code, quel que soit le domaine de départ. Le domaine de retour est
transporté par le paramètre `state`, signé, et revalidé contre la liste des
origines autorisées au moment du retour.

### 3. Activer le mode miroir (instance miroir)

Panneau admin du miroir → **Origines autorisées** → renseigner l'API de
l'instance principale, par exemple `https://rncp.theomouty.fr/api`, puis
**Relayer vers cette API**.

L'URL doit désigner l'**API**, pas le site : `https://rncp.theomouty.fr` tout
court pointe sur le frontend et ne renvoie que du HTML. Le champ complète le
`/api` manquant, et refuse d'enregistrer une adresse qui ne répond pas comme un
backend CalculatorGCC — l'ordre des étapes compte donc : sans l'étape 1,
l'enregistrement échoue avec « n'autorise pas encore … ».

L'instance principale doit par ailleurs faire tourner une version qui gère le
retour multi-domaine ; sinon le contrôle répond « tourne une version trop
ancienne » et il faut la déployer d'abord.

L'effet est immédiat, sans reconstruction ni redémarrage : le backend du miroir
cesse de servir ses propres données et relaie les routes applicatives
(connexion 42, données 42, simulation, calendrier) vers l'instance principale.

Vider le champ remet l'instance sur sa propre base.

Pour un déploiement automatisé, `MIRROR_API_URL` dans l'environnement sert de
valeur de départ — elle n'est lue que tant que rien n'a été réglé depuis le
panneau. Dès qu'on y touche, c'est le panneau qui fait foi, y compris pour
revenir à la base locale : inutile de redéployer pour désactiver le miroir.

### 4. Ce qui reste local sur le miroir

Le panneau d'administration (`/admin`), ses délégués et le réglage du mode
miroir lui-même ne sont **jamais** relayés. Sans cette exception, activer le
mode miroir couperait l'accès qui permet de le désactiver.

Le miroir garde donc une petite base pour lui seul. Il n'a en revanche besoin
d'aucun secret 42 : c'est l'instance principale qui les détient.

Le navigateur du miroir ne voit qu'une seule origine — la sienne — puisque le
relais se fait de serveur à serveur. Il n'y a donc aucune question de CORS côté
navigateur. L'origine du miroir doit néanmoins figurer dans la liste autorisée
de l'instance principale : c'est elle qui décide où revient la connexion 42.

## Ce qu'il ne faut surtout pas faire

**Faire pointer la `DATABASE_URL` du miroir vers la base principale.** C'était
l'idée de départ, elle est piégeuse :

- il faut exposer MariaDB sur Internet, et le port 3306 sortant est
  généralement filtré depuis l'intranet de l'école ;
- chaque requête Prisma devient un aller-retour réseau ;
- surtout, `configRepository.ts` écrase le `JWT_SECRET` stocké en base dès
  qu'une instance démarre avec un secret différent dans son environnement. Le
  miroir écraserait donc celui de l'instance principale, et **tous les
  credentials 42 chiffrés deviendraient indéchiffrables** : l'application
  repasserait en mode setup et plus personne ne pourrait se connecter.

## Vérifier que ça marche

1. Ouvrir le miroir, se connecter avec 42. La barre d'adresse doit passer par
   l'instance principale (`https://rncp.theomouty.fr/api/auth/42?origin=…`),
   puis par 42, et **revenir sur le domaine du miroir**. Le miroir ne relaie pas
   cette étape : il redirige le navigateur, ce qui rend le trajet lisible à
   l'œil en cas de problème.
2. Révoquer l'origine dans le panneau admin, réessayer : la connexion doit
   revenir sur l'instance principale, et l'API refuser les appels cross-origin.

---

## Miroir autonome — sans backend ni base

Le mode décrit plus haut suppose un backend et une base qui tournent : c'est
Fastify qui relaie. Le **miroir autonome** s'en passe — nginx relaie seul.

| | miroir applicatif | miroir autonome |
|---|---|---|
| déclencheur | panneau `/admin` | `MIRROR_API_URL` dans l'environnement |
| conteneurs | nginx + backend + mariadb + phpmyadmin | **nginx seul** |
| qui relaie | hook Fastify `proxyToMirror` | `proxy_pass` nginx |
| réversible sans redéploiement | oui | non |
| administration owner sur place | oui | **non** |

### Déploiement

```bash
export APP_DOMAIN=https://mon-miroir.fr
export MIRROR_API_URL=https://rncp.theomouty.fr/api
docker compose -f docker-compose.mirror.yml up -d --build
```

Le fichier déclare `name: calculatorgcc-mirror`. Sans ce nom de projet distinct,
Compose le déduirait du dossier — le même que pour `dev` et `prod` — et le
service `nginx` du miroir **remplacerait** celui de l'environnement en place.

### Ce que nginx vérifie au démarrage

Il refuse de se lancer si la cible ne répond pas comme une API CalculatorGCC :
code autre que 200, réponse HTML au lieu de JSON (le `/api` oublié), ou corps qui
n'est pas `{"status":"ok"}`. Sans panneau d'administration ici, une URL erronée
donnerait un site mort qu'on ne pourrait corriger qu'en redéployant à l'aveugle.

Une cible simplement **injoignable** ne fait PAS échouer le démarrage : la
configuration est bonne, elle le redeviendra, et refuser ici donnerait un
crash-loop sans même le site statique. Le miroir démarre après quelques tentatives
et sert `api-indisponible.html` en 503 jusqu'à son retour.

Il refuse aussi une cible **qui est elle-même un miroir**, reconnue à son
`"mode":"mirror"`. La chaîne passait sans bruit, puisqu'un miroir répond bien
`{"status":"ok"}` en JSON : elle doublait les relais, et surtout le second miroir
ne voyait plus que l'adresse du premier — journaux et rate-limit de l'instance
principale comptaient alors tous les visiteurs de la chaîne comme un seul.

`APP_DOMAIN` est obligatoire en mode miroir, et sa **forme** est contrôlée :
schéma `http://` ou `https://` exigé. Sans schéma, l'instance principale ne sait
pas lire la valeur comme une origine, et le panneau d'administration refuse la
même chaîne en 400 — l'exploitant recevait une consigne impossible à suivre.

### L'instance principale nous rendra-t-elle la main ?

Le contrôle qui manquait le plus. Le miroir ne demande pas un avis : il **rejoue
le parcours**. Il appelle `/auth/42?origin=<lui-même>` et lit le paramètre `state`
de la redirection renvoyée, qui scelle l'origine de retour. Si ce n'est pas la
sienne, ses visiteurs atterriront ailleurs.

Pourquoi cette méthode et pas une autre : c'est le **comportement réel** qui est
mesuré, pas une opinion collatérale. C'est déjà ce que fait `checkReturnOrigin()`
dans `mirror.service.ts` pour le miroir applicatif, et c'est ce qui a servi à
diagnostiquer la panne. Un premier jet interrogeait `/setup/status?origin=` : cette
route est servie **localement** par un miroir applicatif, qui s'auto-autorise —
elle rendait donc un feu vert sur la panne même qu'on cherchait à signaler.

Pourquoi c'est vital : la connexion 42 part d'ici avec `?origin=<ce miroir>`, mais
c'est la principale qui tranche, et quand l'origine n'est pas déclarée chez elle,
`initiateOAuth` retombe **en silence** sur son propre domaine. Le miroir démarrait
sans broncher, le site s'affichait — et le visiteur qui cliquait « Se connecter »
atterrissait sur le site principal, sans un mot. Constaté le 2026-09-11 sur
`testmirror.theomouty.fr` : le `state` scellait `https://rncp.theomouty.fr` alors
que le miroir avait bien transmis sa propre origine.

**Le miroir démarre quand même**, avec un avertissement très visible. L'origine
est un état **distant**, révocable par quelqu'un d'autre et réparable sans toucher
au miroir : refuser de démarrer mettrait le conteneur en boucle au premier
redémarrage suivant une révocation (`restart: unless-stopped`), et il ne servirait
alors plus rien — pas même le bandeau qui explique la situation. C'est la doctrine
déjà écrite plus haut : on ne refuse de démarrer que si un redéploiement est
nécessaire pour corriger.

Si l'URL n'a pas de chemin, `/api` est ajouté automatiquement.

### Ce qui reste local, ce qui part au relais

- `/api/health` — répond localement. Le healthcheck du conteneur ne doit pas
  dépendre de la cible, sinon un hoquet réseau de celle-ci ferait redémarrer le
  miroir en boucle. Son `ok` ne dit donc **rien** de l'état de l'instance
  principale : la réponse porte `"scope":"nginx-local"` pour le déclarer, et
  `"target"` donne l'adresse à interroger pour surveiller la principale.
- `/api/auth/42` — **redirection 302**, pas relais : l'instance principale
  détient les credentials 42 et son URL est la seule déclarée côté intra. Le
  `?origin=` posé par le frontend ramène l'utilisateur ici à la fin.
- `/api/admin/session/console` — **403**. L'owner s'authentifie avec le token
  console de l'instance principale ; laisser passer cette route ferait transiter
  par le miroir le jeton qui donne tous les droits, sans aucun bénéfice. Les
  **délégués**, eux, entrent avec leur session 42 : le reste de `/admin` est
  relayé normalement.
- tout le reste de `/api/` — relayé **tel qu'écrit**, encodage compris. nginx
  décode l'URI avant de choisir le bloc ; reconstruire le chemin depuis cette
  forme décodée transformait `/api/x%2Fy` en `/api/x/y`, soit deux segments là où
  le client en visait un. Le relais repart donc de `$request_uri`, la ligne brute.
- `/api…` mal encodé au point de ne plus commencer par `/api/` une fois décodé
  (`/api%0a/health`) — **404**. Ces requêtes manquaient tous les blocs d'API et
  finissaient sur le repli SPA : un `index.html` en 200 là où l'appelant attendait
  du JSON.
- `/` — le frontend, servi localement.

`X-Real-IP` et `X-Forwarded-For` portent tous deux `$remote_addr`, et rien
d'autre. C'est indispensable : l'instance principale s'en sert comme clé de
rate-limit quand le visiteur n'est pas connecté, et sans cela tous les visiteurs
du miroir partageraient un seul quota. La chaîne envoyée par le client est
**jetée** plutôt que complétée — sur un miroir exposé en direct, le visiteur y
écrivait ce qu'il voulait, et cette invention repartait vers la principale.

`MIRROR_TRUSTED_PROXY` déclare le reverse proxy éventuellement placé devant le
miroir (`10.0.0.0/8`, par exemple). Par défaut `127.0.0.1/32` — c'est-à-dire
personne : sur un intranet d'école les visiteurs sont eux-mêmes en IP privée, et
faire confiance à leur `X-Forwarded-For` reviendrait à les laisser choisir
l'adresse journalisée.

### Quand l'instance principale ne reconnaît plus ce miroir

Le contrôle de démarrage ne voit qu'un instant : une origine peut être **révoquée**
alors que le miroir tourne. Le frontend joint donc sa propre origine à chaque appel
de `/setup/status`, et affiche un **bandeau** dès que la réponse dit
`origin_allowed: false`.

Ce n'est pas un sondage périodique : la vérification est déclenchée par un
**changement de page**, avec un plafond d'un appel toutes les 30 secondes. Une
révocation reste donc invisible pour qui ne navigue pas. Le bouton « Se
connecter » est alors désactivé, avec la raison.

Un bandeau, et non un écran plein. L'écran plein a été livré puis retiré en audit :
il suffisait que le miroir soit servi sur un port ou un schéma différent de son
`APP_DOMAIN` — le cas par défaut de `docker-compose.mirror.yml`, qui publie un port
en clair — pour que **tout le site** s'éteigne alors que seule la connexion était
cassée. Le remède était pire que le mal.

Trois précisions qui comptent :

- **`false` strict.** `null` et l'absence de champ valent « on ne sait pas » et
  n'affichent rien — sinon un hoquet réseau, ou une principale pas encore à jour,
  déclencheraient une alerte infondée.
- **Les visiteurs connectés aussi.** Une version antérieure ne posait pas la
  question quand un jeton était présent. C'est pourtant le porteur de jeton qui
  subit le plus la panne : il se déconnecte dans l'onglet, reclique, et repart
  chez l'autre instance.
- **Le libellé ne parle pas de « miroir ».** La même réponse survient sur une
  instance principale dont l'`APP_DOMAIN` ne correspond pas au domaine servi.

Une instance qui **ne fait pas autorité** répond `origin_allowed: null` plutôt que
`true` : c'est le cas quand `APP_DOMAIN` est absent, et quand elle est elle-même en
miroir applicatif — sa propre liste blanche ne prouve alors rien. Une non-réponse
ne doit pas s'écrire comme un accord ; c'est exactement le mensonge silencieux
qu'on cherche à supprimer.

### Quand la cible ne répond plus

`api-indisponible.html` s'affiche, en **503**. Une page statique et autonome :
l'application React ne peut pas afficher ce message elle-même, puisqu'elle a
besoin de l'API pour démarrer.

### Résolveur DNS

nginx résout les noms au démarrage quand l'hôte est écrit en dur. La cible étant
externe, elle passe par une variable — ce qui impose un résolveur explicite.
`MIRROR_RESOLVER` vaut `127.0.0.11` (le DNS de Docker) par défaut ; à changer
hors réseau bridge.
