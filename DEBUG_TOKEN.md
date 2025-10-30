# 🐛 Debug: "Invalid or missing token"

## État actuel

✅ Le JWT fonctionne côté backend (test-jwt.js réussi)
✅ JWT_SECRET est configuré
✅ Logs ajoutés pour tracer le problème

## Pour diagnostiquer maintenant

### 1. Redémarrer le backend avec les nouveaux logs
```bash
cd backend
npm run dev
```

### 2. Ouvrir la console navigateur (F12)

### 3. Vider le cache
```javascript
localStorage.clear();
```
Puis Ctrl+Shift+R

### 4. Se connecter

### 5. Observer les logs

#### Dans la console navigateur :
```
[Callback] Processing OAuth callback
[Callback] URL params: { hasToken: true, hasError: false }
[Callback] Saving token
[Auth] Saving token to storage
[Callback] Validating token with backend
[Auth] validateToken - Token exists: true
[Auth] validateToken - Token preview: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
[Auth] validateToken - Response status: 200 ou 401
```

#### Dans le terminal backend :
```
[Auth Controller] Generating JWT with payload: { user_id_42: ..., login: ..., email: ... }
[Auth Controller] JWT generated, length: XXX
[Auth Controller] JWT preview: eyJ...
[Auth Controller] Redirecting to: http://localhost:5173/callback?token=...

[Auth Middleware] Authorization header: Bearer eyJ...
[Auth Middleware] JWT verified successfully, user: { ... }
OU
[Auth Middleware] JWT verification failed: <raison>
```

## Cas possibles

### Cas 1: JWT_SECRET différent
**Symptôme** : Le token est généré côté backend mais pas reconnu

**Solution** :
- Le JWT_SECRET doit être le MÊME entre la génération (callback) et la vérification (me)
- C'est déjà le cas dans notre config

### Cas 2: Token malformé
**Symptôme** : Le token dans l'URL n'est pas le même que celui stocké

**Vérification** :
```javascript
// Dans la console après connexion
console.log(localStorage.getItem('gcc_jwt_token'));
```

Le token doit avoir 3 parties séparées par des points : `eyJ...eyJ...xxx`

### Cas 3: CORS ou headers
**Symptôme** : Le header Authorization n'arrive pas au backend

**Vérification** : Onglet Network dans DevTools, regarder la requête vers `/api/auth/me`

### Cas 4: URL encoding
**Symptôme** : Le token dans l'URL est encodé et décodé incorrectement

**Solution** : Déjà géré par URLSearchParams

## Actions à faire selon les logs

### Si "[Auth Middleware] Authorization header: undefined"
→ Le header n'est pas envoyé, problème côté frontend

### Si "[Auth Middleware] JWT verification failed: invalid signature"
→ Le secret JWT est différent (impossible vu le test)

### Si "[Auth Middleware] JWT verification failed: jwt malformed"
→ Le token n'est pas au bon format (espaces, caractères manquants)

### Si "[Auth] validateToken - Response status: 401"
→ Le backend rejette le token, voir les logs backend pour la raison

## Test manuel

### 1. Récupérer un vrai token
Après connexion, dans la console :
```javascript
const token = localStorage.getItem('gcc_jwt_token');
console.log('Token:', token);
```

### 2. Décoder le token
```javascript
const parts = token.split('.');
const payload = JSON.parse(atob(parts[1]));
console.log('Payload:', payload);
```

### 3. Tester avec curl
```bash
# Remplacer YOUR_TOKEN par le token de la console
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:7000/api/auth/me
```

Si curl fonctionne mais pas le frontend → problème côté frontend
Si curl ne fonctionne pas → problème côté backend

---

**Testez maintenant et partagez les logs !** 🔍
