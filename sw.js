const CACHE_NAME = 'matteo-declic-v1.0.0';
const STATIC_CACHE = 'matteo-declic-static-v1.0.0';
const DYNAMIC_CACHE = 'matteo-declic-dynamic-v1.0.0';

// Fichiers essentiels à mettre en cache
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// Fichiers optionnels (icônes PNG)
const OPTIONAL_ASSETS = [
  './icon-192x192.png',
  './icon-512x512.png'
];

// Installation du Service Worker
self.addEventListener('install', event => {
  console.log('🔮 Service Worker: Installation en cours...');
  
  event.waitUntil(
    Promise.all([
      // Cache des ressources statiques essentielles
      caches.open(STATIC_CACHE).then(cache => {
        console.log('🔮 Service Worker: Mise en cache des ressources essentielles');
        return cache.addAll(STATIC_ASSETS);
      }),
      // Cache des ressources optionnelles (sans faire échouer l'installation)
      caches.open(DYNAMIC_CACHE).then(cache => {
        console.log('🔮 Service Worker: Tentative de cache des icônes');
        return Promise.allSettled(
          OPTIONAL_ASSETS.map(asset => 
            cache.add(asset).catch(err => {
              console.warn('🔮 Service Worker: Icône non trouvée:', asset);
            })
          )
        );
      })
    ]).then(() => {
      console.log('🔮 Service Worker: Installation terminée');
      return self.skipWaiting();
    }).catch(error => {
      console.error('🔮 Service Worker: Erreur lors de l\'installation:', error);
    })
  );
});

// Activation du Service Worker
self.addEventListener('activate', event => {
  console.log('🔮 Service Worker: Activation en cours...');
  
  event.waitUntil(
    Promise.all([
      // Nettoyage des anciens caches
      caches.keys().then(cacheNames => {
        const deletePromises = cacheNames
          .filter(cacheName => 
            cacheName.startsWith('matteo-declic-') && 
            ![STATIC_CACHE, DYNAMIC_CACHE].includes(cacheName)
          )
          .map(cacheName => {
            console.log('🔮 Service Worker: Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          });
        return Promise.all(deletePromises);
      }),
      // Prendre le contrôle immédiatement
      self.clients.claim()
    ]).then(() => {
      console.log('🔮 Service Worker: Activation terminée');
    }).catch(error => {
      console.error('🔮 Service Worker: Erreur lors de l\'activation:', error);
    })
  );
});

// Stratégie de mise en cache intelligente
function getCacheStrategy(request) {
  const url = new URL(request.url);
  
  // Fichiers de l'app (stratégie Cache First)
  if (url.origin === self.location.origin) {
    if (url.pathname === './' || 
        url.pathname === './index.html' || 
        url.pathname === './manifest.json' ||
        url.pathname.includes('icon-') ||
        url.pathname.endsWith('.html') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.jpg') ||
        url.pathname.endsWith('.svg') ||
        url.pathname.endsWith('.ico')) {
      return 'cache-first';
    }
  }
  
  // Par défaut (stratégie Network First)
  return 'network-first';
}

// Implémentation Cache First
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('🔮 Service Worker: Fichier servi depuis le cache:', request.url.split('/').pop());
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
      console.log('🔮 Service Worker: Fichier mis en cache depuis le réseau:', request.url.split('/').pop());
    }
    return networkResponse;
  } catch (error) {
    console.warn('🔮 Service Worker: Erreur Cache First pour:', request.url.split('/').pop());
    // Fallback vers la page principale en cas d'erreur
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      return fallback || new Response('Application hors ligne', { 
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    throw error;
  }
}

// Implémentation Network First
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok && request.method === 'GET') {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
      console.log('🔮 Service Worker: Réponse réseau mise en cache');
    }
    return networkResponse;
  } catch (error) {
    console.warn('🔮 Service Worker: Erreur réseau, tentative depuis le cache');
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('🔮 Service Worker: Fichier servi depuis le cache (fallback)');
      return cachedResponse;
    }
    throw error;
  }
}

// Interception des requêtes
self.addEventListener('fetch', event => {
  // Ignorer les requêtes non-GET et les requêtes Chrome extension
  if (event.request.method !== 'GET' || 
      event.request.url.startsWith('chrome-extension://') ||
      event.request.url.startsWith('moz-extension://')) {
    return;
  }

  const strategy = getCacheStrategy(event.request);
  
  event.respondWith(
    (async () => {
      try {
        if (strategy === 'cache-first') {
          return await cacheFirst(event.request);
        } else {
          return await networkFirst(event.request);
        }
      } catch (error) {
        console.error('🔮 Service Worker: Erreur lors du traitement de la requête');
        
        // Fallback ultime pour les navigations
        if (event.request.mode === 'navigate') {
          const fallback = await caches.match('./index.html');
          if (fallback) {
            return fallback;
          }
        }
        
        // Réponse d'erreur générique
        return new Response('Contenu non disponible', {
          status: 404,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })()
  );
});

// Gestion des messages depuis l'application
self.addEventListener('message', event => {
  console.log('🔮 Service Worker: Message reçu:', event.data);
  
  switch (event.data?.type) {
    case 'SKIP_WAITING':
      console.log('🔮 Service Worker: Activation forcée');
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports[0]?.postMessage({ version: CACHE_NAME });
      break;
      
    case 'CLEAR_CACHE':
      caches.keys().then(cacheNames => {
        const deletePromises = cacheNames
          .filter(name => name.startsWith('matteo-declic-'))
          .map(name => caches.delete(name));
        return Promise.all(deletePromises);
      }).then(() => {
        console.log('🔮 Service Worker: Cache nettoyé');
        event.ports[0]?.postMessage({ success: true });
      });
      break;
      
    case 'PREFETCH_ORACLE':
      console.log('🔮 Service Worker: Pré-chargement oracle demandé');
      event.ports[0]?.postMessage({ success: true });
      break;
  }
});

// Synchronisation en arrière-plan
self.addEventListener('sync', event => {
  console.log('🔮 Service Worker: Événement sync:', event.tag);
  
  switch (event.tag) {
    case 'background-sync':
      event.waitUntil(performBackgroundSync());
      break;
      
    case 'oracle-prefetch':
      event.waitUntil(prefetchOracle());
      break;
  }
});

// Fonctions de synchronisation
async function performBackgroundSync() {
  try {
    console.log('🔮 Service Worker: Synchronisation en arrière-plan');
    
    // Nettoyer le cache dynamique si trop volumineux
    const cache = await caches.open(DYNAMIC_CACHE);
    const requests = await cache.keys();
    
    // Limiter le cache dynamique à 50 entrées
    if (requests.length > 50) {
      const oldestRequests = requests.slice(0, requests.length - 50);
      await Promise.all(oldestRequests.map(request => cache.delete(request)));
      console.log('🔮 Service Worker: Cache dynamique nettoyé,', oldestRequests.length, 'entrées supprimées');
    }
    
    // Pré-charger les ressources importantes
    await cache.add('./index.html').catch(() => console.log('🔮 Service Worker: Impossible de pré-charger index.html'));
    
    console.log('🔮 Service Worker: Synchronisation terminée');
  } catch (error) {
    console.error('🔮 Service Worker: Erreur lors de la synchronisation:', error);
  }
}

async function prefetchOracle() {
  try {
    console.log('🔮 Service Worker: Pré-chargement de l\'oracle');
    
    const cache = await caches.open(DYNAMIC_CACHE);
    await cache.add('./').catch(() => console.log('🔮 Service Worker: Pré-chargement échoué'));
    
    console.log('🔮 Service Worker: Pré-chargement terminé');
  } catch (error) {
    console.error('🔮 Service Worker: Erreur lors du pré-chargement:', error);
  }
}

// Gestion des notifications push
self.addEventListener('push', event => {
  console.log('🔮 Service Worker: Notification push reçue');
  
  let notificationData = {
    title: 'Matteo\'s Declic',
    body: 'Votre oracle mystique quotidien vous attend...',
    icon: './icon-192x192.png',
    badge: './icon-192x192.png',
    tag: 'oracle-daily',
    requireInteraction: false,
    silent: false
  };
  
  // Traiter les données de la notification si disponibles
  if (event.data) {
    try {
      const pushData = event.data.json();
      notificationData = { ...notificationData, ...pushData };
    } catch (error) {
      console.warn('🔮 Service Worker: Données push invalides:', error);
    }
  }
  
  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    tag: notificationData.tag,
    requireInteraction: notificationData.requireInteraction,
    silent: notificationData.silent,
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 'oracle-notification',
      url: './?source=notification'
    },
    actions: [
      {
        action: 'open-oracle',
        title: 'Découvrir l\'oracle'
      },
      {
        action: 'dismiss',
        title: 'Plus tard'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
      .then(() => console.log('🔮 Service Worker: Notification affichée'))
      .catch(error => console.error('🔮 Service Worker: Erreur notification:', error))
  );
});

// Gestion des clics sur les notifications
self.addEventListener('notificationclick', event => {
  console.log('🔮 Service Worker: Clic sur notification, action:', event.action);
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || './';
  
  switch (event.action) {
    case 'open-oracle':
      event.waitUntil(openOrFocusApp(urlToOpen + '&action=oracle'));
      break;
      
    case 'dismiss':
      console.log('🔮 Service Worker: Notification fermée par l\'utilisateur');
      break;
      
    default:
      // Clic sur la notification elle-même
      event.waitUntil(openOrFocusApp(urlToOpen));
      break;
  }
});

// Fonction utilitaire pour ouvrir ou focus l'application
async function openOrFocusApp(url) {
  try {
    const clients = await self.clients.matchAll({ 
      type: 'window',
      includeUncontrolled: true 
    });
    
    // Chercher une fenêtre existante de l'app
    for (const client of clients) {
      if (client.url.includes(self.location.origin)) {
        console.log('🔮 Service Worker: Focus sur fenêtre existante');
        await client.focus();
        
        // Naviguer vers l'URL spécifiée si différente
        if (client.navigate && !client.url.includes(url)) {
          await client.navigate(url);
        }
        return client;
      }
    }
    
    // Ouvrir une nouvelle fenêtre si aucune n'existe
    if (self.clients.openWindow) {
      console.log('🔮 Service Worker: Ouverture nouvelle fenêtre');
      return await self.clients.openWindow(url);
    }
  } catch (error) {
    console.error('🔮 Service Worker: Erreur lors de l\'ouverture de l\'app:', error);
  }
}

// Gestion de la fermeture des notifications
self.addEventListener('notificationclose', event => {
  console.log('🔮 Service Worker: Notification fermée:', event.notification.tag);
});

// Gestion des erreurs globales du Service Worker
self.addEventListener('error', event => {
  console.error('🔮 Service Worker: Erreur globale:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('🔮 Service Worker: Promise rejetée:', event.reason);
});

// Fonction utilitaire pour vérifier si une réponse est valide
function isValidResponse(response) {
  return response && 
         response.status === 200 && 
         response.type === 'basic';
}

// Fonction utilitaire pour nettoyer périodiquement les caches
async function cleanupCaches() {
  try {
    const cacheNames = await caches.keys();
    const oldCaches = cacheNames.filter(name => 
      name.startsWith('matteo-declic-') && 
      !name.includes('v1.0.0')
    );
    
    if (oldCaches.length > 0) {
      await Promise.all(oldCaches.map(name => caches.delete(name)));
      console.log('🔮 Service Worker: Anciens caches supprimés:', oldCaches);
    }
  } catch (error) {
    console.error('🔮 Service Worker: Erreur nettoyage cache:', error);
  }
}

// Fonction utilitaire pour obtenir les statistiques du cache
async function getCacheStats() {
  try {
    const cacheNames = await caches.keys();
    const stats = {};
    
    for (const cacheName of cacheNames) {
      if (cacheName.startsWith('matteo-declic-')) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        stats[cacheName] = keys.length;
      }
    }
    
    console.log('🔮 Service Worker: Statistiques cache:', stats);
    return stats;
  } catch (error) {
    console.error('🔮 Service Worker: Erreur stats cache:', error);
    return {};
  }
}

// Nettoyage périodique automatique (toutes les 24h)
setInterval(() => {
  cleanupCaches();
  getCacheStats();
}, 24 * 60 * 60 * 1000);

// Log de démarrage
console.log('🔮 Service Worker v1.0.0: Chargé et prêt!');
console.log('🔮 Cache statique:', STATIC_CACHE);
console.log('🔮 Cache dynamique:', DYNAMIC_CACHE);
console.log('🔮 Ressources essentielles:', STATIC_ASSETS);
console.log('🔮 Ressources optionnelles:', OPTIONAL_ASSETS);

// Export des fonctions utilitaires pour les tests (si nécessaire)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getCacheStrategy,
    cacheFirst,
    networkFirst,
    isValidResponse,
    cleanupCaches,
    getCacheStats
  };
}