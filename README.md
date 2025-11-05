# 🎓 Simulator - Calculateur de Niveau 42

Application web pour calculer et suivre votre progression dans le cursus 42, avec tracking des projets et compétences RNCP.

## 🚀 Démarrage Rapide

```bash
# Démarrer en mode développement
make dev

# Accéder à l'application
open http://localhost:3000
```

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
- Stockage sécurisé des credentials dans .env
- JWT pour l'API
- Protection automatique des routes avant configuration

## 📦 Stack Technique

### Frontend
- **React 19** + **TypeScript**
- **Vite** - Build tool ultra-rapide
- **TailwindCSS** - Styling
- **Framer Motion** - Animations
- **React Router** - Routing
- **Sass** - Styling avancé

### Backend
- **Fastify** - Framework Node.js performant
- **TypeScript** - Typage fort
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

## 📖 Structure du Projet

```
Simulator/
├── backend/              # API Fastify
│   ├── Dockerfile
│   └── srcs/
│       ├── src/
│       │   ├── controllers/
│       │   ├── middlewares/
│       │   ├── routes/
│       │   └── server.ts
│       └── package.json
│
├── frontend/             # Application React
│   ├── Dockerfile
│   └── srcs/
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── contexts/
│       │   ├── services/
│       │   └── App.tsx
│       └── package.json
│
├── nginx/                # Reverse proxy
│   ├── Dockerfile
│   ├── entrypoint.sh
│   └── conf/
│       ├── nginx.conf.template
│       ├── frontend_dev.conf
│       └── frontend_production.conf
│
├── docker-compose.dev.yml   # Config développement
├── docker-compose.prod.yml  # Config production
├── Makefile                 # Commandes
└── Documentation/
    ├── DOCKER.md
    ├── QUICKSTART.md
    └── SUMMARY.md
```

## 🌐 Accès

- **Application** : https://localhost:3000
- **API** : https://localhost:3000/api/

**Note** : Les certificats SSL sont auto-signés (normal pour le dev)

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

## 🙏 Remerciements

- École 42 pour l'API et les données
- La communauté 42
- Tous les contributeurs

---

**Made with ❤️ at 42**
