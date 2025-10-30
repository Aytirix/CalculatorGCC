# 🐛 Guide de Debug - Problème de connexion

## Symptôme
L'utilisateur clique sur "Se connecter", s'authentifie sur 42, mais n'est pas connecté après la redirection.

## Corrections apportées

### 1. AuthContext - Redirection après callback
- Ajout de la capture du retour de `handleCallback()` 
- Redirection automatique vers `/dashboard` quand un nouveau token est détecté
- Ajout de logs détaillés pour diagnostiquer

### 2. CORS Backend
- Ajout de `http://localhost:5180` dans les origines autorisées
- Maintien de `http://localhost:5173` pour compatibilité

### 3. Logs de debug
- Ajout de logs préfixés `[Auth]` et `[AuthContext]` pour suivre le flux

## Comment tester

### 1. Ouvrir la console du navigateur
Ouvrir la console avant de cliquer sur "Se connecter" (F12)

### 2. Observer les logs
Vous devriez voir :
```
[Auth] handleCallback - URL params: { hasToken: true/false, hasError: true/false }
[Auth] Token received, saving to storage (si token présent)
[Auth] Token saved successfully
[AuthContext] Starting auth initialization
[AuthContext] Has new token: true
[AuthContext] Is authenticated: true
[AuthContext] Validating token with backend...
[AuthContext] Token valid: true
[AuthContext] User info: { user_id_42: ..., login: ..., ... }
[AuthContext] User set successfully
[AuthContext] New token detected, redirecting to dashboard
```

### 3. Vérifier le localStorage
Dans la console, taper :
```javascript
localStorage.getItem('gcc_jwt_token')
```
Devrait retourner une longue chaîne (le JWT)

### 4. Vérifier l'URL après redirection
L'URL devrait être :
1. `http://localhost:5180/?token=eyJ...` (juste après 42)
2. Puis `http://localhost:5180/dashboard` (après redirection auto)

## Points de contrôle

### ✅ Backend
```bash
cd backend
npm run dev
```
Vérifier que ça affiche :
```
🚀 Calculator GCC Backend Started
Port: 7000
Environment: development
Frontend: http://localhost:5180
```

### ✅ Frontend
```bash
cd frontend
npm run dev
```
Vérifier le port (devrait être 5180 ou 5173)

### ✅ Variables d'environnement

#### backend/.env
```bash
FRONTEND_URL=http://localhost:5180  # ⚠️ Doit correspondre au port du frontend
CLIENT_ID_42=votre_client_id
CLIENT_SECRET_42=votre_client_secret
REDIRECT_URI=http://localhost:7000/api/auth/callback
JWT_SECRET=votre_secret
```

#### frontend/.env
```bash
VITE_BACKEND_URL=http://localhost:7000
```

### ✅ OAuth 42 Redirect URI
Sur https://profile.intra.42.fr/oauth/applications, vérifier que le Redirect URI est :
```
http://localhost:7000/api/auth/callback
```

## Problèmes courants

### ❌ "Token received" mais pas "Token saved"
→ Problème avec localStorage, vérifier les permissions du navigateur

### ❌ "Token valid: false"
→ Le backend ne reconnaît pas le JWT
→ Vérifier JWT_SECRET identique entre backend et la génération

### ❌ CORS error dans la console
→ Vérifier que `FRONTEND_URL` dans backend/.env correspond au port du frontend
→ Vérifier que le backend est bien démarré

### ❌ "authentication_failed" dans l'URL
→ Erreur lors de l'échange du code OAuth
→ Vérifier CLIENT_ID_42 et CLIENT_SECRET_42
→ Vérifier REDIRECT_URI

### ❌ Pas de logs "[Auth]"
→ Le frontend n'est pas recompilé avec les nouveaux logs
→ Faire Ctrl+Shift+R pour forcer le rechargement

## Étapes de debug

1. **Vider le cache et localStorage**
   ```javascript
   localStorage.clear();
   ```
   Puis Ctrl+Shift+R

2. **Tester le backend manuellement**
   ```bash
   curl http://localhost:7000/health
   ```
   Devrait retourner `{"status":"ok",...}`

3. **Tester l'OAuth**
   Ouvrir directement : `http://localhost:7000/api/auth/42`
   Vous devez être redirigé vers 42

4. **Vérifier les tokens**
   Après connexion, dans la console :
   ```javascript
   // Token stocké ?
   console.log(localStorage.getItem('gcc_jwt_token'));
   
   // Payload du token
   const token = localStorage.getItem('gcc_jwt_token');
   if (token) {
     const payload = JSON.parse(atob(token.split('.')[1]));
     console.log(payload);
   }
   ```

## Si ça ne marche toujours pas

1. Copier tous les logs de la console
2. Vérifier l'onglet Network dans DevTools :
   - La requête vers `/api/auth/callback` réussit ?
   - Le statut est 302 (redirect) ?
   - Le header `Location` contient le token ?
3. Partager les informations pour analyse

---

**Après ces corrections, le flux devrait fonctionner ! 🎯**
