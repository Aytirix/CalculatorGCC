# Migration - API 42 via Backend

## 🎯 Changement majeur

**AVANT** : Le frontend appelait directement l'API 42  
**APRÈS** : Le frontend appelle le backend qui appelle l'API 42

## ✅ Avantages

- 🔒 **Plus sécurisé** : Le token API 42 ne transite jamais côté client
- 🚀 **Plus rapide** : Le backend peut mettre en cache
- 🛡️ **Rate limiting** : Le backend gère les limitations de l'API 42
- 📊 **Monitoring** : Le backend peut logger les appels
- 🔄 **Retry automatique** : Le backend peut réessayer en cas d'erreur

## 📡 Nouvelles routes backend

### Authentification
- `GET /api/auth/42` - Initie l'OAuth
- `GET /api/auth/callback` - Callback OAuth
- `GET /api/auth/me` - Info utilisateur depuis le JWT
- `POST /api/auth/logout` - Déconnexion

### API 42 (via backend)
- `GET /api/api42/projects` - Projets de l'utilisateur
- `GET /api/api42/cursus` - Cursus de l'utilisateur
- `GET /api/api42/events` - Événements de l'utilisateur
- `GET /api/api42/user-data` - Toutes les données en une fois (optimisé)
- `GET /api/api42/me` - Infos complètes de l'utilisateur

Toutes ces routes nécessitent le JWT dans le header `Authorization: Bearer <token>`

## 🔄 Migration du code frontend

### Ancien code (❌ À remplacer)

```typescript
import { api42Service } from '@/services/api42.service';
import { authService } from '@/services/auth.service';

// Récupérer les tokens
const tokens = authService.getTokens();
const user = authService.getUser();

// Appeler l'API 42 directement
const userData = await api42Service.getUserData(
  tokens.access_token,
  user.id
);
```

### Nouveau code (✅ À utiliser)

```typescript
import { BackendAPI42Service } from '@/services/backend-api42.service';

// Pas besoin de gérer les tokens, tout est automatique
const userData = await BackendAPI42Service.getUserData();
```

## 📝 Exemples d'utilisation

### Récupérer toutes les données utilisateur

```typescript
import { BackendAPI42Service } from '@/services/backend-api42.service';

try {
  const userData = await BackendAPI42Service.getUserData();
  console.log('Level:', userData.level);
  console.log('Projects:', userData.projects);
  console.log('Events:', userData.eventsCount);
} catch (error) {
  console.error('Error:', error);
}
```

### Récupérer seulement les projets

```typescript
const projects = await BackendAPI42Service.getUserProjects();
console.log('Projects:', projects);
```

### Récupérer les projets validés

```typescript
const validatedProjects = await BackendAPI42Service.getValidatedProjects();
console.log('Validated projects:', validatedProjects);
```

### Récupérer le niveau actuel

```typescript
const { level, xp } = await BackendAPI42Service.getCurrentLevel();
console.log('Current level:', level);
```

### Récupérer les événements

```typescript
const events = await BackendAPI42Service.getUserEvents();
console.log('Events count:', events.length);
```

## 🔧 Modifications nécessaires

### 1. Dashboard.tsx

**Avant** :
```typescript
import { api42Service } from '@/services/api42.service';
import { authService } from '@/services/auth.service';

const tokens = authService.getTokens();
const user = authService.getUser();
const userData = await api42Service.getUserData(tokens.access_token, user.id);
```

**Après** :
```typescript
import { BackendAPI42Service } from '@/services/backend-api42.service';

const userData = await BackendAPI42Service.getUserData();
```

### 2. AuthContext.tsx

Déjà migré ✅

### 3. Login.tsx

Déjà migré ✅

### 4. Callback.tsx

Déjà migré ✅

## 🗑️ Fichiers à supprimer

Ces fichiers ne sont plus nécessaires :

- ❌ `frontend/src/services/auth.service.ts` (remplacé par `backend-auth.service.ts`)
- ❌ `frontend/src/services/api42.service.ts` (remplacé par `backend-api42.service.ts`)
- ❌ `frontend/src/services/api42.direct.service.ts` (pas besoin, tout passe par le backend)

⚠️ Gardez-les temporairement le temps de tout migrer, puis supprimez-les.

## 📦 Services disponibles

### `BackendAPI42Service`

Toutes les méthodes sont statiques et ne nécessitent pas d'instanciation :

```typescript
// Projets
await BackendAPI42Service.getUserProjects();
await BackendAPI42Service.getValidatedProjects();

// Cursus
await BackendAPI42Service.getUserCursus();
await BackendAPI42Service.getCurrentLevel();

// Événements
await BackendAPI42Service.getUserEvents();
await BackendAPI42Service.getEventsCount();

// Données complètes (optimisé, une seule requête)
await BackendAPI42Service.getUserData();

// Infos utilisateur complètes
await BackendAPI42Service.getMe();
```

### `backendAuthService`

```typescript
// Connexion
backendAuthService.login();

// Récupérer les infos utilisateur (depuis JWT)
const user = backendAuthService.getUser();

// Vérifier l'authentification
const isAuth = backendAuthService.isAuthenticated();

// Déconnexion
await backendAuthService.logout();
```

## 🎯 Checklist de migration

- [x] Backend : Routes API 42 créées
- [x] Backend : Middleware d'authentification
- [x] Frontend : Nouveau service `BackendAPI42Service`
- [ ] Frontend : Migrer le Dashboard
- [ ] Frontend : Supprimer les anciens services
- [ ] Frontend : Tester l'authentification
- [ ] Frontend : Tester la récupération des données

## ⚠️ Points d'attention

### Gestion des erreurs

Le backend retourne des erreurs HTTP standards :
- `401` - Token expiré ou invalide → Déconnexion automatique
- `500` - Erreur serveur ou API 42 indisponible

### Cache

Le frontend ne gère plus le cache. Si vous voulez du cache :
1. **Option 1** : Implémenter le cache côté backend
2. **Option 2** : Utiliser React Query / SWR côté frontend

### Rate Limiting

Le backend gère déjà le retry automatique en cas de rate limit de l'API 42.

## 🚀 Prochaines étapes

1. **Migrer le Dashboard** pour utiliser `BackendAPI42Service`
2. **Tester** l'authentification et la récupération des données
3. **Supprimer** les anciens services (`auth.service.ts`, `api42.service.ts`)
4. **Nettoyer** la configuration (`config.ts` ne contient plus que `backendUrl`)
