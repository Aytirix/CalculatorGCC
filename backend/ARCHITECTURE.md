# Architecture Backend Simplifiée

## Vue d'ensemble

Le backend a été simplifié pour ne gérer **que l'authentification OAuth 42**. Il ne stocke plus aucune donnée en base de données.

### Principe de fonctionnement

1. **Authentification OAuth** : Le backend gère le flux OAuth avec l'API 42
2. **Token dans JWT** : Le token d'accès de l'API 42 est stocké dans un JWT signé
3. **Frontend autonome** : Le frontend utilise le token pour appeler directement l'API 42

## Structure du JWT

Le JWT généré contient les informations suivantes :

```typescript
{
  api_token: string;           // Token d'accès de l'API 42
  refresh_token?: string;      // Token de rafraîchissement (si fourni)
  token_expires_at?: number;   // Timestamp d'expiration du token API
  user_id_42: number;          // ID de l'utilisateur sur 42
  login: string;               // Login de l'utilisateur
  email: string;               // Email de l'utilisateur
  image_url?: string;          // URL de l'avatar
}
```

## Routes disponibles

### Authentification

- **GET /api/auth/42** : Initie le flux OAuth
- **GET /api/auth/callback** : Callback OAuth, retourne le JWT
- **GET /api/auth/me** : Récupère les infos de l'utilisateur connecté (protégé)
- **POST /api/auth/logout** : Endpoint de déconnexion (protégé)

### Health Check

- **GET /health** : Vérification que le serveur est en ligne

## Variables d'environnement

```bash
# Serveur
PORT=7000
NODE_ENV=development
FRONTEND_URL=http://localhost:5180

# OAuth 42
CLIENT_ID_42=your_client_id
CLIENT_SECRET_42=your_client_secret
REDIRECT_URI=http://localhost:7000/api/auth/callback

# JWT
JWT_SECRET=your_very_secure_secret_key

# Rate Limiting (optionnel)
RATE_LIMIT_MAX=100
RATE_LIMIT_TIMEWINDOW=60000
```

**Note** : La variable `DB_ENCRYPTION_KEY` n'est plus nécessaire.

## Utilisation côté Frontend

### 1. Récupération du JWT après connexion

Après redirection depuis le callback OAuth :

```typescript
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

if (token) {
  // Stocker le token (localStorage, context, etc.)
  localStorage.setItem('jwt_token', token);
  
  // Décoder le JWT pour accéder aux infos
  const payload = JSON.parse(atob(token.split('.')[1]));
  const apiToken = payload.api_token;
}
```

### 2. Appels directs à l'API 42

Le frontend peut maintenant appeler directement l'API 42 :

```typescript
const apiToken = getApiTokenFromJWT(); // Extraire du JWT

const response = await fetch('https://api.intra.42.fr/v2/me/projects', {
  headers: {
    Authorization: `Bearer ${apiToken}`,
  },
});
```

### 3. Vérification de l'authentification

Pour vérifier que le JWT est toujours valide :

```typescript
const jwtToken = localStorage.getItem('jwt_token');

const response = await fetch('http://localhost:7000/api/auth/me', {
  headers: {
    Authorization: `Bearer ${jwtToken}`,
  },
});

if (response.ok) {
  const userData = await response.json();
  // userData contient api_token, user_id_42, login, email, image_url
}
```

## Avantages de cette architecture

1. **Simplicité** : Pas de base de données à gérer
2. **Stateless** : Le backend ne maintient aucun état
3. **Sécurité** : Le token API est chiffré dans le JWT
4. **Performance** : Les appels à l'API 42 sont faits directement depuis le frontend
5. **Scalabilité** : Pas de synchronisation de données nécessaire

## Sécurité

- ✅ Le JWT est signé avec une clé secrète
- ✅ Le token API 42 est stocké dans le JWT (chiffré)
- ✅ CORS configuré pour n'accepter que le frontend
- ✅ Helmet pour sécuriser les headers HTTP
- ✅ Rate limiting pour prévenir les abus
- ⚠️ Le JWT a une durée de vie de 7 jours (configurable)

## Développement

```bash
# Installation
npm install

# Développement avec hot reload
npm run dev

# Build production
npm run build

# Lancement production
npm start
```

## Migration depuis l'ancienne version

Si vous migrez depuis la version avec base de données :

1. Les anciennes données utilisateur ne sont plus nécessaires
2. Les projets seront maintenant stockés uniquement côté frontend
3. Supprimer le fichier `data.db` s'il existe
4. Mettre à jour les variables d'environnement (retirer `DB_ENCRYPTION_KEY`)
5. Réinstaller les dépendances : `npm install`
