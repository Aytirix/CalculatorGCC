# Calculator GCC Backend

Backend simplifié pour Calculator GCC avec authentification OAuth 42. Le backend ne stocke aucune donnée, il gère uniquement l'authentification et retourne un JWT contenant le token d'accès à l'API 42.

## 🚀 Fonctionnalités

- ✅ Authentification OAuth 42
- ✅ JWT contenant le token API 42
- ✅ Rate limiting
- ✅ Protection CORS et Helmet
- ✅ TypeScript strict
- ✅ Stateless (aucune base de données)

## 📦 Installation

```bash
cd backend
npm install
```

## ⚙️ Configuration

1. Copier le fichier d'environnement :
```bash
cp .env.example .env
```

2. Générer le secret JWT :
```bash
# Utiliser le script fourni
./generate-secrets.sh

# Ou manuellement
openssl rand -base64 32
```

3. Configurer les variables dans `.env` :
```env
CLIENT_ID_42=votre_client_id
CLIENT_SECRET_42=votre_client_secret
JWT_SECRET=votre_jwt_secret_généré
FRONTEND_URL=http://localhost:5180
```

4. Créer une application OAuth sur https://profile.intra.42.fr/oauth/applications
   - Redirect URI: `http://localhost:7000/api/auth/callback`

## 🏃 Lancement

```bash
# Développement avec hot reload
npm run dev

# Build production
npm run build

# Lancement production
npm start

# Vérification des types
npm run typecheck
```

## 📚 API Endpoints

### Authentication
- `GET /api/auth/42` - Initie l'OAuth 42
- `GET /api/auth/callback` - Callback OAuth (redirige vers frontend avec JWT)
- `GET /api/auth/me` - Info utilisateur depuis le JWT (nécessite JWT)
- `POST /api/auth/logout` - Endpoint de déconnexion

### Health
- `GET /health` - Status du serveur

## 🔒 Sécurité

- **JWT** : Tokens signés avec expiration 7 jours
- **Rate Limiting** : 100 requêtes / minute par IP
- **CORS** : Restreint au frontend uniquement
- **Helmet** : Headers de sécurité HTTP
- **Stateless** : Aucune donnée stockée côté serveur

## 📁 Structure

```
backend/
├── src/
│   ├── config/          # Configuration et variables d'env
│   ├── controllers/     # Logique métier (auth uniquement)
│   ├── middlewares/     # Auth middleware
│   ├── routes/          # Routes API
│   ├── types/           # Types TypeScript
│   └── server.ts        # Point d'entrée
├── package.json
└── tsconfig.json
```

## 🔧 Variables d'environnement

| Variable | Description | Requis | Défaut |
|----------|-------------|--------|--------|
| `PORT` | Port du serveur | Non | 7000 |
| `NODE_ENV` | Environnement | Non | development |
| `FRONTEND_URL` | URL du frontend | Non | http://localhost:5180 |
| `CLIENT_ID_42` | Client ID OAuth 42 | **Oui** | - |
| `CLIENT_SECRET_42` | Client Secret OAuth 42 | **Oui** | - |
| `REDIRECT_URI` | URI de callback OAuth | **Oui** | - |
| `JWT_SECRET` | Secret pour signer les JWT | **Oui** | - |
| `RATE_LIMIT_MAX` | Max requêtes par fenêtre | Non | 100 |
| `RATE_LIMIT_TIMEWINDOW` | Fenêtre en ms | Non | 60000 |

## 📝 Structure du JWT

Le JWT généré contient les informations suivantes :

```typescript
{
  api_token: string;           // Token d'accès de l'API 42
  refresh_token?: string;      // Token de rafraîchissement
  token_expires_at?: number;   // Timestamp d'expiration du token API
  user_id_42: number;          // ID de l'utilisateur sur 42
  login: string;               // Login de l'utilisateur
  email: string;               // Email de l'utilisateur
  image_url?: string;          // URL de l'avatar
}
```

## 🔄 Flux d'authentification

1. Frontend redirige vers `GET /api/auth/42`
2. L'utilisateur s'authentifie sur l'intra 42
3. 42 redirige vers `GET /api/auth/callback?code=...`
4. Le backend échange le code contre un token API 42
5. Le backend récupère les infos utilisateur
6. Le backend génère un JWT contenant le token API et les infos
7. Le backend redirige vers le frontend avec le JWT en paramètre
8. Le frontend stocke le JWT et peut appeler directement l'API 42

## 📖 Documentation complète

Voir [ARCHITECTURE.md](./ARCHITECTURE.md) pour une documentation détaillée de l'architecture et de l'utilisation.
