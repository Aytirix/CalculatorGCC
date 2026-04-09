# 🎓 Simulator - Calculateur de Niveau 42

Application web pour calculer et suivre votre progression dans le cursus 42, avec tracking des projets et compétences RNCP.

### 🔧 Configuration Initiale

Au premier démarrage, vous serez redirigé vers la page de configuration :

1. **Créer une application OAuth 42** :
   - Allez sur https://profile.intra.42.fr/oauth/applications
   - Créez une nouvelle application
   - Redirect URI: `http://localhost:3000/callback`

2. **Configurer l'application** :
   - Visitez http://localhost:3000/setup
   - Entrez votre Client ID et Client Secret
   - Cliquez sur "Complete Setup"

3. **C'est prêt !** 🎉
   - L'application redémarre automatiquement
   - Vous pouvez maintenant vous connecter avec votre compte 42

## 📚 Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Guide de démarrage rapide (commencez ici !)
- **[DOCKER.md](DOCKER.md)** - Documentation Docker complète
- **[SUMMARY.md](SUMMARY.md)** - Résumé de la configuration Docker

## 🛠️ Commandes Principales

| Commande | Description |
|----------|-------------|
| `make help` | Afficher toutes les commandes |
| `make dev` | Mode développement (hot-reload) |
| `make prod` | Mode production (build optimisé) |
| `make stop` | Arrêter tous les services |
| `make logs` | Voir les logs |
| `make status` | État des conteneurs |
| `make urls` | Afficher les URLs d'accès |

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│         Port 3000 (HTTPS)               │
│              Nginx                      │
└─────────────┬───────────────────────────┘
              │
         ┌────┴────┐
         │         │
    ┌────▼───┐ ┌──▼─────┐
    │ /api/  │ │   /    │
    │Backend │ │Frontend│
    │Fastify │ │ React  │
    └────────┘ └────────┘
```

## 🎯 Fonctionnalités

### 📊 Calcul de Niveau
- Calcul automatique du niveau basé sur l'XP
- Tracking des projets validés
- Import de données depuis l'API 42

### 📈 Suivi RNCP
- RNCP 6 : Développeur Web & Mobile, Développeur Applicatif
- RNCP 7 : Architecte Systèmes & Réseaux, Architecte BDD & Data
- Pourcentage de complétion par compétence

### ✨ Interface
- Mode sombre/clair
- Interface intuitive et responsive
- Ajout de projets personnalisés
- Notes et pourcentages personnalisables

### 🔐 Authentification & Sécurité
- OAuth 42 avec configuration initiale sécurisée
- Setup wizard avec token one-time
- JWT pour l'API
- Protection automatique des routes avant configuration

## 📦 Stack Technique

### Frontend
- **React 19** + **TypeScript**
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **Framer Motion** - Animations
- **React Router** - Routing
- **Sass** - Styling avancé

### Backend
- **Fastify** - Framework Node.js
- **TypeScript** - Typage
- **JWT** - Authentification
- **Zod** - Validation
- **OAuth 42** - Authentification 42

### Infrastructure
- **Docker** - Containerisation
- **Nginx** - Reverse proxy & SSL
- **Docker Compose** - Orchestration

## 🔧 Développement

### Prérequis
- Docker & Docker Compose
- Make
- Git

### Installation
```bash
# Cloner le repo
git clone https://github.com/Aytirix/CalculatorGCC.git
cd Simulator

# Démarrer
make dev
```

### Modes

#### Mode Développement
```bash
make dev
```
- ✅ Hot-reload automatique
- ✅ HMR (Hot Module Replacement)
- ✅ Volumes montés
- ✅ Logs en direct

#### Mode Production
```bash
make prod
```
- ✅ Builds optimisés
- ✅ Cache des assets
- ✅ Images minimales
- ✅ Fichiers statiques

## 🌐 Accès

- **Application** : https://localhost:3000
- **API** : https://localhost:3000/api/

## 🚀 Déploiement Coolify

### Production et préproduction sur le même serveur

Ce projet peut faire tourner une **prod** et une **préprod** sur le même serveur Coolify, avec la logique suivante :

- la **prod** garde sa propre base MariaDB
- la **préprod** a aussi sa propre base MariaDB locale
- la **préprod** peut cloner une copie récente de la base **prod** avant de démarrer
- la **préprod** n'écrit jamais dans la base **prod**

### Pourquoi il faut une configuration dédiée

Sur Coolify, deux applications sur le même serveur ne partagent pas automatiquement :

- leur réseau Docker interne
- leur base de données
- leurs labels Traefik
- leurs volumes persistants

Donc si vous voulez une préprod qui teste sur une copie de la prod, il faut :

1. isoler les volumes MariaDB
2. donner un alias réseau distinct à chaque MariaDB
3. connecter la MariaDB prod au réseau partagé `coolify`
4. laisser la préprod cloner la base prod dans sa propre base locale

### Variables importantes

Les variables suivantes sont prévues dans [.env.example](.env.example) :

- `APP_DOMAIN` : domaine public de l'application
- `TRAEFIK_ROUTER_NAME` : nom du router Traefik, unique par environnement
- `TRAEFIK_SERVICE_NAME` : nom du service Traefik, unique par environnement
- `MARIADB_DATA_PATH` : chemin persistant local de la DB MariaDB
- `DB_SHARED_ALIAS` : alias réseau de cette DB sur le réseau externe `coolify`
- `CLONE_FROM_PROD_ENABLED` : active le clonage prod -> préprod
- `PROD_DB_HOST` : alias réseau de la DB prod, joignable depuis la préprod
- `PROD_DB_PORT` : port de la DB prod, généralement `3306`
- `PROD_DB_NAME` : nom de la base prod à cloner
- `PROD_DB_USER` : utilisateur utilisé par la préprod pour lire la base prod
- `PROD_DB_PASSWORD` : mot de passe de cet utilisateur

### Configuration recommandée

#### Variables pour la prod

```env
APP_DOMAIN=rncp.theomouty.fr
TRAEFIK_ROUTER_NAME=calculatorgcc-prod
TRAEFIK_SERVICE_NAME=calculatorgcc-prod

MARIADB_DATA_PATH=/data/calculatorgcc-prod/mariadb
DB_SHARED_ALIAS=calculatorgcc-prod-db

CLONE_FROM_PROD_ENABLED=false
```

#### Variables pour la préprod

```env
APP_DOMAIN=preprod-rncp.theomouty.fr
TRAEFIK_ROUTER_NAME=calculatorgcc-preprod
TRAEFIK_SERVICE_NAME=calculatorgcc-preprod

MARIADB_DATA_PATH=/data/calculatorgcc-preprod/mariadb
DB_SHARED_ALIAS=calculatorgcc-preprod-db

CLONE_FROM_PROD_ENABLED=true
PROD_DB_HOST=calculatorgcc-prod-db
PROD_DB_PORT=3306
PROD_DB_NAME=calculatorgcc
PROD_DB_USER=<utilisateur_prod>
PROD_DB_PASSWORD=<mot_de_passe_prod>
```

### Comment ça fonctionne

En mode préprod avec clonage activé :

1. la MariaDB préprod démarre sur son propre volume local
2. le service `db-clone` attend que la DB préprod soit prête
3. le service `db-clone` se connecte à la DB prod via `PROD_DB_HOST`
4. il vide et recrée la base locale préprod
5. il importe un dump de la base prod dans la DB préprod
6. ensuite seulement le backend démarre
7. le backend applique `prisma migrate deploy` sur la **DB préprod**

Résultat :

- la préprod teste sur des données proches de la prod
- les migrations et écritures applicatives restent cantonnées à la préprod
- la prod n'est jamais modifiée par la préprod

### Important : `PROD_DB_HOST` sur Coolify

Si la prod et la préprod tournent sur le même serveur Coolify, `PROD_DB_HOST` doit pointer vers l'alias réseau de la MariaDB prod sur le réseau partagé `coolify`.

Dans la configuration recommandée ci-dessus :

```env
PROD_DB_HOST=calculatorgcc-prod-db
```

Ce n'est **pas** :

- `localhost`
- `mariadb`
- le domaine web public

### Pré-requis côté prod

Pour que la préprod puisse cloner la base prod, il faut :

- que la MariaDB prod soit déployée avec `DB_SHARED_ALIAS=calculatorgcc-prod-db`
- que l'utilisateur `PROD_DB_USER` puisse se connecter à la DB prod
- que le mot de passe `PROD_DB_PASSWORD` soit correctement défini dans la préprod

Un utilisateur lecture seule peut suffire pour le dump si ses droits permettent l'export. Sinon, utilisez un utilisateur applicatif ou admin adapté à votre politique de sécurité.

### Pièges à éviter

- Ne pas utiliser le même `MARIADB_DATA_PATH` pour la prod et la préprod.
- Ne pas utiliser les mêmes `TRAEFIK_ROUTER_NAME` et `TRAEFIK_SERVICE_NAME`.
- Ne pas mettre `PROD_DB_HOST=localhost`.
- Ne pas pointer la préprod directement sur la DB prod dans `DATABASE_URL`.

### Symptôme classique d'une mauvaise config

Si la préprod et la prod partagent le même `MARIADB_DATA_PATH`, MariaDB peut démarrer en erreur ou rester `unhealthy`, car deux instances essaient d'utiliser les mêmes fichiers de données.

### Fichiers concernés

- [docker-compose.prod.yml](docker-compose.prod.yml)
- [.env.example](.env.example)
- [scripts/clone-prod-db.sh](scripts/clone-prod-db.sh)
- [coolify-init-app.md](coolify-init-app.md)

## 🤝 Contribution

1. Fork le projet
2. Créer une branche (`git checkout -b feature/amazing`)
3. Commit les changements (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing`)
5. Ouvrir une Pull Request

## 📝 License

Ce projet est sous licence MIT.

## 👤 Auteur

**Aytirix**
- GitHub: [@Aytirix](https://github.com/Aytirix)
- 42: thmouty

---

**Made with ❤️ at 42**
