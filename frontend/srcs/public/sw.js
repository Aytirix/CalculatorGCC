/*
 * Service worker de CalculatorGCC — volontairement MINIMAL.
 *
 * Il ne met RIEN en cache : l'application doit toujours afficher les données
 * fraîches de l'API, et un cache de service worker mal invalidé servirait une
 * vieille version du site sans que personne ne s'en aperçoive. Son seul rôle :
 * rendre l'application installable (« vraie » appli, sans la barre de Chrome)
 * et afficher une page claire quand il n'y a pas de réseau, au lieu de l'écran
 * d'erreur du navigateur.
 *
 * nginx le sert en `no-cache` (nginx/conf/frontend_*.conf) : une nouvelle
 * version est prise en compte à la prochaine visite.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const OFFLINE_PAGE = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hors connexion — CalculatorGCC</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f5f4f0;color:#14171c;padding:24px;box-sizing:border-box}
  @media (prefers-color-scheme: dark){body{background:#1a1a1a;color:#fff}}
  main{max-width:360px;text-align:center}
  h1{font-size:20px;margin:0 0 8px} p{margin:0 0 20px;line-height:1.5;opacity:.8}
  button{font:inherit;font-weight:600;height:44px;padding:0 20px;border:0;border-radius:10px;background:#2563eb;color:#fff;cursor:pointer}
</style></head>
<body><main>
  <h1>Pas de connexion</h1>
  <p>CalculatorGCC a besoin d'internet pour lire tes données 42. Vérifie ta connexion puis réessaie.</p>
  <button onclick="location.reload()">Réessayer</button>
</main></body></html>`;

self.addEventListener('fetch', (event) => {
  // Uniquement les navigations (ouverture d'une page) : tout le reste — API,
  // scripts, images — passe directement au réseau, sans intervention.
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() =>
      new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
    ),
  );
});
