# Backend Setup

## Installation rapide

```bash
# 1. Installer les dépendances
npm install

# 2. Générer les secrets
echo "JWT_SECRET=$(openssl rand -base64 32)"
echo "DB_ENCRYPTION_KEY=$(openssl rand -hex 32)"

# 3. Copier et configurer l'environnement
cp .env.example .env
# Éditer .env avec vos secrets et credentials OAuth 42

# 4. Lancer en développement
npm run dev
```

## Scripts disponibles

- `npm run dev` - Lance le serveur en mode développement avec hot reload
- `npm run build` - Compile le TypeScript en JavaScript
- `npm start` - Lance le serveur en production
- `npm run typecheck` - Vérifie les types TypeScript

## Configuration OAuth 42

1. Créer une application sur https://profile.intra.42.fr/oauth/applications
2. Redirect URI: `http://localhost:7000/api/auth/callback`
3. Copier Client ID et Client Secret dans `.env`

## Structure des données chiffrées

Exemple de données stockées dans `user_projects.project_data` :

```json
{
  "projects": {
    "libft": {
      "completed": true,
      "note": "Premier projet validé !",
      "percentage": 125
    },
    "ft_printf": {
      "completed": false,
      "note": "En cours",
      "percentage": 50
    }
  },
  "customProjects": [
    {
      "id": "custom-1",
      "name": "Projet Personnel",
      "xp": 500,
      "category": "programmation"
    }
  ],
  "professionalExp": 12,
  "eventsAttended": 5
}
```

## Sécurité

### Chiffrement
- Algorithm: AES-256-GCM
- Key derivation: PBKDF2 (100,000 iterations)
- Unique salt per entry
- Authentication tag for integrity

### Rate Limiting
- 100 requêtes par minute par IP
- Personnalisable via `RATE_LIMIT_MAX` et `RATE_LIMIT_TIMEWINDOW`

### Headers de sécurité
- CORS restreint au frontend
- Helmet pour headers HTTP sécurisés
- CSP (Content Security Policy)

## Logs

En développement, les logs sont affichés avec `pino-pretty` pour une meilleure lisibilité.

En production, les logs sont au format JSON pour faciliter l'analyse.
