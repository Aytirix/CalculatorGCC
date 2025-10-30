# 🔧 Fix du flux d'authentification

## 🐛 Problème identifié

L'utilisateur se connectait sur 42, mais n'était pas authentifié après la redirection.

### Cause racine
1. Le backend redirigeait vers `/?token=...`
2. La route `/` chargeait immédiatement (vérifie `isAuthenticated`)
3. Mais `handleCallback()` dans AuthContext n'avait pas encore traité le token
4. Résultat : le token était dans l'URL mais pas encore sauvegardé dans localStorage

## ✅ Solution implémentée

### Architecture du flux OAuth
```
Utilisateur
    ↓ Clic "Se connecter"
Frontend (/login)
    ↓ Redirect
Backend (/api/auth/42)
    ↓ Redirect
API 42 (authentification)
    ↓ Redirect + code
Backend (/api/auth/callback)
    ↓ Échange code → token API 42
    ↓ Génère JWT
    ↓ Redirect avec ?token=...
Frontend (/callback)  ← NOUVEAU !
    ↓ Traite le token
    ↓ Sauvegarde dans localStorage
    ↓ Valide auprès du backend
    ↓ Redirect
Dashboard (authentifié ✅)
```

### Changements effectués

#### 1. Backend - `auth.controller.ts`
**Avant** :
```typescript
const redirectUrl = new URL(config.frontendUrl);  // Redirige vers /
```

**Après** :
```typescript
const redirectUrl = new URL(`${config.frontendUrl}/callback`);  // Redirige vers /callback
```

#### 2. Frontend - `Callback.tsx`
**Avant** : Redirigeait immédiatement vers `/` (perdait le token)

**Après** : Traite le token AVANT de rediriger
```typescript
const processCallback = async () => {
  const token = searchParams.get('token');
  
  if (token) {
    // 1. Sauvegarder le token
    backendAuthService.saveToken(token);
    
    // 2. Valider le token
    const isValid = await backendAuthService.validateToken();
    
    // 3. Rediriger vers le dashboard
    if (isValid) {
      navigate('/dashboard', { replace: true });
    }
  }
};
```

#### 3. AuthContext
**Suppression** : La logique `handleCallback()` (maintenant dans Callback.tsx)

**Simplifié** : Vérifie seulement si un token existe au démarrage

#### 4. backend-auth.service.ts
**Suppression** : La méthode `handleCallback()` (déplacée dans Callback.tsx)

**Gardé** : `saveToken()` est maintenant publique

## 🧪 Pour tester

1. **Redémarrer le backend**
   ```bash
   cd backend
   npm run dev
   ```

2. **Ouvrir la console** (F12)

3. **Vider le cache**
   ```javascript
   localStorage.clear();
   ```
   Puis Ctrl+Shift+R

4. **Cliquer sur "Se connecter"**

5. **Observer les logs** :
   ```
   [Callback] Processing OAuth callback
   [Callback] URL params: { hasToken: true, hasError: false }
   [Callback] Saving token
   [Auth] Saving token to storage
   [Callback] Validating token with backend
   [Callback] Token valid, redirecting to dashboard
   [AuthContext] Starting auth initialization
   [AuthContext] Is authenticated: true
   [AuthContext] Validating token with backend...
   [AuthContext] Token valid: true
   [AuthContext] User info: { ... }
   [AuthContext] User set successfully
   ```

## ✨ Avantages de cette approche

1. **Séparation des responsabilités**
   - `/callback` : Traite l'OAuth uniquement
   - AuthContext : Gère l'état d'authentification global

2. **Gestion d'erreur robuste**
   - Affichage d'erreur si le token est invalide
   - Redirection automatique vers `/` en cas d'échec

3. **Logs détaillés**
   - Facile à debugger avec les logs `[Callback]` et `[AuthContext]`

4. **UX améliorée**
   - Page de chargement pendant la validation
   - Message d'erreur si problème

## 🎯 URLs du flux

1. **Login** : `http://localhost:5180/`
2. **OAuth 42** : `http://localhost:7000/api/auth/42`
3. **Callback backend** : `http://localhost:7000/api/auth/callback?code=...`
4. **Callback frontend** : `http://localhost:5180/callback?token=eyJ...`
5. **Dashboard** : `http://localhost:5180/dashboard`

## 🔍 Vérifications

### Token dans localStorage
```javascript
localStorage.getItem('gcc_jwt_token')
// Doit retourner un JWT (3 parties séparées par des points)
```

### Payload du JWT
```javascript
const token = localStorage.getItem('gcc_jwt_token');
const payload = JSON.parse(atob(token.split('.')[1]));
console.log(payload);
// Doit contenir: api_token, user_id_42, login, email, image_url
```

### Validation backend
```bash
# Récupérer le token
TOKEN=$(echo "localStorage.getItem('gcc_jwt_token')" | node -e "console.log(require('fs').readFileSync(0, 'utf-8'))")

# Tester l'endpoint
curl -H "Authorization: Bearer $TOKEN" http://localhost:7000/api/auth/me
```

---

**Le flux d'authentification est maintenant corrigé ! 🎉**

L'utilisateur sera correctement authentifié après la redirection depuis 42.
