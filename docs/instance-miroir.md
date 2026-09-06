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
valeur de départ ; le réglage enregistré depuis le panneau a la priorité.

### 4. Ce qui reste local sur le miroir

Le panneau d'administration (`/admin`), ses passkeys et le réglage du mode
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
