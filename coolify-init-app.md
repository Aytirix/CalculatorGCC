# Déploiement d'une application Docker Compose sur Coolify

## Prérequis

- Un serveur Coolify opérationnel avec Traefik comme proxy
- Un domaine pointant vers le serveur
- Le réseau proxy Coolify créé (par défaut : `coolify`)

---

## 1. Vérifier le nom du réseau proxy Traefik

Dans Coolify, aller dans **Proxy > Configuration**. Le nom du réseau Docker utilisé par Traefik est affiché (par défaut `coolify`).

---

## 2. Créer l'application sur Coolify

1. **New Resource** > **Docker Compose**
2. Coller le contenu du `docker-compose.yml` ou pointer vers le repo Git
3. Définir le domaine cible

---

## 3. Configurer le `docker-compose.yml` pour Traefik

### Labels Traefik sur le service exposé

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.<app>.rule=Host(`mondomaine.fr`)"
  - "traefik.http.routers.<app>.entrypoints=https"
  - "traefik.http.routers.<app>.tls=true"
  - "traefik.http.routers.<app>.tls.certresolver=letsencrypt"
  - "traefik.http.services.<app>.loadbalancer.server.port=<port-interne>"
  - "traefik.docker.network=coolify"
```

> Remplacer `<app>` par un identifiant unique (ex: `monapp`), `<port-interne>` par le port sur lequel écoute le container.

### Rattacher le service au réseau Traefik

Le service exposé doit être sur **deux réseaux** : son réseau interne + le réseau `coolify`.

```yaml
services:
  app:
    # ...
    networks:
      - app_network
      - coolify

  db:
    # ...
    networks:
      - app_network  # pas besoin du réseau coolify pour les services internes

networks:
  app_network:
    driver: bridge
  coolify:
    external: true  # réseau géré par Coolify, ne pas le recréer
```

---

## 4. Architecture réseau

```
Internet
   │
   ▼
Traefik (réseau: coolify)
   │  règle: Host(`mondomaine.fr`)
   ▼
service exposé (réseaux: coolify + app_network)
   │
   └──► services internes (réseau: app_network uniquement)
```

Les services internes (base de données, cache, etc.) n'ont **pas** besoin d'être sur le réseau `coolify`.

---

## 5. Points importants

**Ne pas exposer les ports sur l'hôte**

Traefik accède aux containers via le réseau Docker — inutile de mapper les ports :

```yaml
# À éviter si Traefik est utilisé
ports:
  - "3000:3000"
```

**Le label `traefik.docker.network` est obligatoire** quand un container est sur plusieurs réseaux. Sans lui, Traefik peut prendre la mauvaise IP et échouer avec un `504 Gateway Timeout`.

**`ENABLE_SSL` / TLS applicatif**

Si l'application gère son propre TLS (Nginx, Apache...), le désactiver en prod sur Coolify : c'est Traefik qui termine le TLS, pas l'application.

---

## 6. Problème Gateway Timeout (504)

**Symptôme :** Traefik répond `504` alors que les logs du service montrent des réponses normales.

**Causes fréquentes :**

| Cause | Solution |
|---|---|
| Service pas sur le réseau `coolify` | Ajouter `coolify` aux réseaux du service |
| Label `traefik.docker.network` absent | L'ajouter pour forcer Traefik sur le bon réseau |
| Mauvais port dans le label | Vérifier `loadbalancer.server.port` |
| `traefik.enable=true` absent | L'ajouter explicitement |

---

## 7. Variables d'environnement

Les définir dans **Coolify > l'application > Environment Variables** plutôt que dans un `.env` committé.

Pour déployer une **préprod** et une **prod** sur le même serveur, il faut au minimum des valeurs différentes pour:

- `APP_DOMAIN`
- `TRAEFIK_ROUTER_NAME`
- `TRAEFIK_SERVICE_NAME`
- `MARIADB_DATA_PATH`
- `DB_SHARED_ALIAS`

Exemple:

```env
# prod
APP_DOMAIN=rncp.theomouty.fr
TRAEFIK_ROUTER_NAME=calculatorgcc-prod
TRAEFIK_SERVICE_NAME=calculatorgcc-prod
MARIADB_DATA_PATH=/data/calculatorgcc-prod/mariadb
DB_SHARED_ALIAS=calculatorgcc-prod-db
REQUIRE_CONFIGURED_DB=false

# preprod
APP_DOMAIN=preprod-rncp.theomouty.fr
TRAEFIK_ROUTER_NAME=calculatorgcc-preprod
TRAEFIK_SERVICE_NAME=calculatorgcc-preprod
MARIADB_DATA_PATH=/data/calculatorgcc-preprod/mariadb
DB_SHARED_ALIAS=calculatorgcc-preprod-db
REQUIRE_CONFIGURED_DB=true
```

Si la **préprod** doit tester sur une copie recente de la prod sans jamais ecrire dans la DB prod, ajouter aussi:

```env
CLONE_FROM_PROD_ENABLED=true
PROD_DB_HOST=calculatorgcc-prod-db
PROD_DB_PORT=3306
PROD_DB_NAME=calculatorgcc
PROD_DB_USER=<user-lecture-ou-admin>
PROD_DB_PASSWORD=<mot-de-passe>
```

Dans ce mode:

- la préprod restaure d'abord une copie de la DB prod dans **sa propre** DB locale
- le backend démarre ensuite et applique ses migrations Prisma sur la DB préprod
- la prod n'est jamais modifiée par la préprod
- si la DB n'est pas configuree apres le clone, le backend refuse de demarrer quand `REQUIRE_CONFIGURED_DB=true`
- les logs de clonage apparaissent dans le conteneur backend

### Note stockage MariaDB

Le `docker-compose.prod.yml` garde un stockage MariaDB externe sur l'hote, mais via un volume Docker configure en bind :

```yaml
volumes:
  mariadb_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ${MARIADB_DATA_PATH:?}
```

Sur Coolify, c'est plus robuste que la forme courte `/data/...:/var/lib/mysql`, car l'interpolation `${...}` dans la source directe d'un volume peut etre rejetee avant meme le deploiement.

Le mecanisme repose sur le reseau Docker externe `coolify`, partage par les applications Coolify sur le meme serveur.

---

## 8. Redéployer après modification

Déclencher un redéploiement depuis **Coolify > l'application > Deploy**, ou en CLI sur le serveur :

```bash
docker compose -f docker-compose.yml up -d --build
```
