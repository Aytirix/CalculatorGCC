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

---

## 8. Redéployer après modification

Déclencher un redéploiement depuis **Coolify > l'application > Deploy**, ou en CLI sur le serveur :

```bash
docker compose -f docker-compose.yml up -d --build
```
