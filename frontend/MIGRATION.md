# Migration Frontend - Nouvelle Architecture d'Authentification

## 📋 Résumé des changements

Le frontend ne gère plus directement l'OAuth 42. Tout passe maintenant par le backend qui retourne un JWT contenant le token d'accès à l'API 42.

## ✅ Fichiers créés

### Services
1. **`backend-auth.service.ts`** - Nouveau service pour l'authentification via le backend
2. **`api42.direct.service.ts`** - Service pour les appels directs à l'API 42

### Modifications
- **`AuthContext.tsx`** - Mise à jour pour utiliser le nouveau service
- **`Login.tsx`** - Utilise maintenant `login()` du context au lieu de construire l'URL OAuth
- **`Callback.tsx`** - Simplifié, redirige vers l'accueil (le backend gère le callback)
- **`config.ts`** - Ajout de `backendUrl`
- **`.env.example`** - Mise à jour avec `VITE_BACKEND_URL`

## 🔄 Nouveau flux d'authentification

### Avant (❌ Ancien flux - exposait le client_secret)
```
1. Frontend → API 42 (avec client_id visible dans l'URL)
2. API 42 → Frontend (/callback avec code)
3. Frontend → API 42 (échange code contre token avec client_secret ⚠️)
4. Frontend → localStorage (stocke le token API)
```

### Après (✅ Nouveau flux - sécurisé)
```
1. Frontend → Backend (/api/auth/42)
2. Backend → API 42 (OAuth)
3. API 42 → Backend (callback avec code)
4. Backend ↔ API 42 (échange code contre token avec client_secret 🔒)
5. Backend → Frontend (redirect avec JWT contenant le token API)
6. Frontend → localStorage (stocke le JWT)
7. Frontend → API 42 (appels directs avec token extrait du JWT)
```

## 🔧 Configuration nécessaire

### 1. Variables d'environnement

Créer/Mettre à jour `.env` :

```bash
# Backend URL
VITE_BACKEND_URL=http://localhost:7000

# Pour référence uniquement (non utilisé côté frontend)
VITE_42_CLIENT_ID=your_client_id
VITE_42_REDIRECT_URI=http://localhost:5180
```

**Important** : `VITE_42_CLIENT_SECRET` ne doit PLUS être dans le `.env` frontend !

### 2. Configuration OAuth 42

Sur https://profile.intra.42.fr/oauth/applications, configurer :
- **Redirect URI** : `http://localhost:7000/api/auth/callback` ⚠️ (backend, pas frontend !)

## 📝 Utilisation dans les composants

### Connexion

```tsx
import { useAuth } from '@/contexts/AuthContext';

function LoginButton() {
  const { login } = useAuth();
  
  return (
    <button onClick={login}>
      Se connecter avec 42
    </button>
  );
}
```

### Accéder aux infos utilisateur

```tsx
import { useAuth } from '@/contexts/AuthContext';

function UserProfile() {
  const { user, isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <div>Non connecté</div>;
  }
  
  return (
    <div>
      <img src={user?.image_url} alt={user?.login} />
      <p>{user?.login}</p>
      <p>{user?.email}</p>
    </div>
  );
}
```

### Appels à l'API 42

```tsx
import { API42Service } from '@/services/api42.direct.service';

async function fetchUserProjects() {
  try {
    const projects = await API42Service.getUserProjects();
    console.log('Projects:', projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
  }
}
```

### Déconnexion

```tsx
import { useAuth } from '@/contexts/AuthContext';

function LogoutButton() {
  const { logout } = useAuth();
  
  return (
    <button onClick={logout}>
      Se déconnecter
    </button>
  );
}
```

## 🔐 Sécurité

### Avantages de la nouvelle architecture

✅ **Client secret protégé** : Ne quitte jamais le backend  
✅ **JWT signé** : Le token API 42 est chiffré dans un JWT signé  
✅ **Validation côté serveur** : Le backend valide le JWT  
✅ **Expiration gérée** : Le JWT a une durée de vie de 7 jours  

### Ce qui est stocké

- **localStorage** : JWT uniquement (signé et sécurisé)
- **Backend** : Rien ! (stateless)

## 🚀 Migration étape par étape

### 1. S'assurer que le backend tourne

```bash
cd backend
npm install
npm run dev
```

Le backend doit être accessible sur `http://localhost:7000`

### 2. Mettre à jour les variables d'environnement

```bash
cd frontend
cp .env.example .env
# Éditer .env et ajouter VITE_BACKEND_URL=http://localhost:7000
```

### 3. Supprimer le client_secret du frontend

⚠️ **Important** : Retirer `VITE_42_CLIENT_SECRET` du `.env` frontend !

### 4. Mettre à jour l'application OAuth 42

Sur https://profile.intra.42.fr/oauth/applications :
- Changer le **Redirect URI** vers : `http://localhost:7000/api/auth/callback`

### 5. Tester l'authentification

1. Cliquer sur "Se connecter avec 42"
2. Vous serez redirigé vers le backend (`localhost:7000`)
3. Le backend vous redirige vers l'API 42
4. Après authentification, l'API 42 vous renvoie vers le backend
5. Le backend vous renvoie vers le frontend avec le JWT
6. Le frontend stocke le JWT et vous connecte automatiquement

## 📦 Services disponibles

### `backendAuthService`

```typescript
import { backendAuthService } from '@/services/backend-auth.service';

// Connexion
backendAuthService.login();

// Récupérer le JWT
const jwt = backendAuthService.getToken();

// Récupérer le payload
const payload = backendAuthService.getPayload();

// Récupérer le token API 42
const apiToken = backendAuthService.getApiToken();

// Récupérer les infos utilisateur
const user = backendAuthService.getUser();

// Vérifier l'authentification
const isAuth = backendAuthService.isAuthenticated();

// Valider le token
const isValid = await backendAuthService.validateToken();

// Déconnexion
await backendAuthService.logout();
```

### `API42Service`

```typescript
import { API42Service } from '@/services/api42.direct.service';

// Récupérer les infos utilisateur
const me = await API42Service.getMe();

// Récupérer les projets
const projects = await API42Service.getUserProjects();

// Récupérer un projet spécifique
const project = await API42Service.getProject(123);

// Récupérer les cursus
const cursus = await API42Service.getUserCursus();

// Récupérer les achievements
const achievements = await API42Service.getUserAchievements();

// Recherche générique
const results = await API42Service.search('/users', { 
  filter: 'staff' 
});
```

## ⚠️ Points d'attention

### Routes

Le backend redirige maintenant vers l'URL racine du frontend (`/`) et non plus vers `/callback`. La page `/callback` existe toujours pour compatibilité mais redirige immédiatement vers `/`.

### Token API 42

Le token API 42 est automatiquement utilisé par `API42Service`. Vous n'avez pas besoin de le gérer manuellement.

### Expiration

Si le token API 42 expire (401), l'utilisateur sera automatiquement déconnecté.

## 🔍 Debug

### Vérifier le JWT

```typescript
import { backendAuthService } from '@/services/backend-auth.service';

const payload = backendAuthService.getPayload();
console.log('JWT Payload:', payload);
console.log('API Token:', payload?.api_token);
console.log('User:', payload?.login);
```

### Vérifier la connexion au backend

```bash
curl http://localhost:7000/health
# Devrait retourner: {"status":"ok",...}
```

## 📚 Fichiers modifiés

```
frontend/src/
├── services/
│   ├── backend-auth.service.ts     ✨ Nouveau
│   ├── api42.direct.service.ts     ✨ Nouveau
│   └── auth.service.ts             ⚠️ Obsolète (garder pour compatibilité)
├── contexts/
│   └── AuthContext.tsx             ✏️ Modifié
├── pages/
│   ├── Login/Login.tsx             ✏️ Modifié
│   └── Callback/Callback.tsx       ✏️ Modifié
├── config/
│   └── config.ts                   ✏️ Modifié
└── .env.example                    ✏️ Modifié
```

## 🎉 Avantages

- ✅ Plus sécurisé (client_secret protégé)
- ✅ Plus simple (moins de logique OAuth côté frontend)
- ✅ Plus flexible (appels directs à l'API 42)
- ✅ Backend stateless (pas de base de données)
- ✅ JWT avec toutes les infos nécessaires
