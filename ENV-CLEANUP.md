# 🧹 Nettoyage des variables d'environnement

## Variables supprimées (construites automatiquement)

### Backend (`backend/srcs/.env`)
❌ **Supprimées :**
- `FRONTEND_URL` → Construite automatiquement : `{protocol}://{hostname}:3000`
- `REDIRECT_URI` → Construite automatiquement : `{protocol}://{hostname}:3000/callback`

✅ **Conservées (obligatoires) :**
- `PORT=7000`
- `CLIENT_ID_42`
- `CLIENT_SECRET_42`
- `JWT_SECRET`
- `RATE_LIMIT_MAX`
- `RATE_LIMIT_TIMEWINDOW`

### Frontend (`frontend/srcs/.env`)
❌ **Supprimées :**
- `VITE_BACKEND_URL` → Construite automatiquement : `{protocol}://{hostname}:3000/api`
- `VITE_API_URL` → Construite automatiquement : `{protocol}://{hostname}:3000/api`

✅ **Aucune variable nécessaire !**
Tout est injecté par Docker Compose depuis le `.env` racine.

## Configuration centralisée

Toutes les URLs sont désormais générées à partir de 2 variables dans le `.env` racine :

```bash
HOSTNAME=localhost      # ou votre IP
ENABLE_SSL=false        # true pour HTTPS
```

## Construction automatique

### Backend (`src/config/config.ts`)
```typescript
const hostname = process.env.HOSTNAME || 'localhost';
const enableSSL = process.env.ENABLE_SSL === 'true';

config = {
  frontendUrl: buildUrl(hostname, 3000, enableSSL),
  oauth42: {
    redirectUri: buildUrl(hostname, 3000, enableSSL) + '/callback',
  }
}
```

### Frontend (`src/config/config.ts`)
```typescript
const hostname = import.meta.env.VITE_HOSTNAME || 'localhost';
const enableSSL = import.meta.env.VITE_ENABLE_SSL === 'true';

config = {
  backendUrl: buildUrl(hostname, 3000, enableSSL, '/api'),
  appUrl: buildUrl(hostname, 3000, enableSSL),
}
```

## Architecture des ports

```
┌─────────────────────────────────────────┐
│    Port 3000 (externe - unique port)    │
│              Nginx                       │
└─────────────┬────────────────────────────┘
              │
         ┌────┴────┐
         │         │
    ┌────▼───┐ ┌──▼─────┐
    │ /api/  │ │   /    │
    │Backend │ │Frontend│
    │ :7000  │ │ :5173  │
    │(interne│ │(interne│
    │ Docker)│ │ Docker)│
    └────────┘ └────────┘
```

## Utilisation dans le code

### Backend
```typescript
import { config } from './config/config';

// URL du frontend (pour CORS, redirections)
console.log(config.frontendUrl);

// URI de redirection OAuth 42
console.log(config.oauth42.redirectUri);
```

### Frontend
```typescript
import { config } from './config/config';

// URL de l'API backend (via Nginx)
fetch(`${config.backendUrl}/auth/me`);

// URL de l'application
window.location.href = config.appUrl;
```

## Avantages

✅ **Un seul endroit à modifier** : `.env` racine
✅ **Pas de duplication** : Les URLs sont cohérentes partout
✅ **Moins d'erreurs** : Pas de risque d'oublier de mettre à jour une URL
✅ **Plus simple** : 2 variables au lieu de 6+
✅ **Flexible** : Override possible si besoin

## Override (optionnel)

Si vous avez besoin d'URLs personnalisées, vous pouvez toujours les définir :

**Backend :**
```bash
FRONTEND_URL=http://custom-domain.com:3000
REDIRECT_URI=http://custom-domain.com:3000/callback
```

**Frontend :**
```bash
VITE_API_URL=http://custom-domain.com:3000/api
```

Ces valeurs auront la priorité sur la construction automatique.

---

✨ **Configuration simplifiée et centralisée !**
