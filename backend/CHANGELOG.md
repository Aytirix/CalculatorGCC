# Changelog - Simplification du Backend

## Date : 26 octobre 2025

## Changements majeurs

### Architecture

**Avant** : Backend avec base de données SQLite, chiffrement, stockage des données utilisateurs et projets.

**Après** : Backend stateless, sans base de données, gérant uniquement l'authentification OAuth 42.

### Modifications

#### ✅ Supprimés
- ❌ Base de données SQLite (`src/models/database.ts`)
- ❌ Chiffrement AES-256-GCM (`src/utils/encryption.ts`)
- ❌ Routes et contrôleurs des projets (`project.controller.ts`, `project.routes.ts`)
- ❌ Routes et contrôleurs des utilisateurs (`user.controller.ts`, `user.routes.ts`)
- ❌ Dépendance `better-sqlite3`
- ❌ Variable d'environnement `DB_ENCRYPTION_KEY`

#### ✨ Ajoutés
- ✅ Token API 42 dans le JWT
- ✅ Documentation complète (`ARCHITECTURE.md`, `FRONTEND_INTEGRATION.md`)
- ✅ Exemples de services frontend
- ✅ Support du refresh_token

#### 🔄 Modifiés
- JWT payload : inclut maintenant `api_token`, `refresh_token`, `token_expires_at`, et les infos utilisateur complètes
- Contrôleur d'authentification : ne stocke plus rien, retourne directement un JWT
- Configuration : suppression des variables liées à la DB
- README : documentation mise à jour

### Nouveau flux d'authentification

```
1. Frontend → Backend (/api/auth/42)
2. Backend → API 42 (OAuth)
3. API 42 → Backend (callback avec code)
4. Backend ↔ API 42 (échange code contre token)
5. Backend → Frontend (redirection avec JWT)
6. Frontend → API 42 (appels directs avec api_token)
```

### Structure du JWT

```typescript
{
  api_token: string;           // Token d'accès de l'API 42
  refresh_token?: string;      // Token de rafraîchissement
  token_expires_at?: number;   // Timestamp d'expiration
  user_id_42: number;          // ID de l'utilisateur
  login: string;               // Login
  email: string;               // Email
  image_url?: string;          // Avatar
}
```

### Routes conservées

- `GET /api/auth/42` - Initie l'OAuth
- `GET /api/auth/callback` - Callback OAuth
- `GET /api/auth/me` - Info utilisateur (JWT)
- `POST /api/auth/logout` - Déconnexion
- `GET /health` - Health check

### Avantages

1. **Simplicité** : Pas de base de données à gérer
2. **Stateless** : Aucun état côté serveur
3. **Performance** : Appels directs à l'API 42
4. **Scalabilité** : Facile à déployer et à mettre à l'échelle
5. **Maintenance** : Moins de code, moins de dépendances

### Migration

Si vous aviez une version précédente :

1. Supprimer le fichier `data.db`
2. Retirer `DB_ENCRYPTION_KEY` du `.env`
3. Réinstaller les dépendances : `npm install`
4. Adapter le frontend pour stocker le JWT et faire des appels directs à l'API 42

### Variables d'environnement

**Avant** :
```env
CLIENT_ID_42=...
CLIENT_SECRET_42=...
REDIRECT_URI=...
JWT_SECRET=...
DB_ENCRYPTION_KEY=...  ← Supprimé
```

**Après** :
```env
CLIENT_ID_42=...
CLIENT_SECRET_42=...
REDIRECT_URI=...
JWT_SECRET=...
```

### Documentation

- **ARCHITECTURE.md** : Architecture détaillée du backend
- **FRONTEND_INTEGRATION.md** : Guide d'intégration frontend avec exemples de code
- **README.md** : Documentation mise à jour

### Fichiers supprimés

```
backend/src/
├── models/
│   └── database.ts          ← Supprimé
├── utils/
│   └── encryption.ts        ← Supprimé
└── controllers/
    ├── project.controller.ts ← Supprimé
    └── user.controller.ts    ← Supprimé
```

### Notes

- Le frontend doit maintenant gérer le stockage des données localement (localStorage, IndexedDB, etc.)
- Les appels à l'API 42 se font directement depuis le frontend avec le `api_token` extrait du JWT
- Le JWT est signé et a une validité de 7 jours (configurable)
