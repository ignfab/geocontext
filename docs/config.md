# Configuration du serveur MCP

## Points clés

- L'utilisation du MCP sous forme d'un processus local (`npx -y @ignfab/geocontext`) ne requiert pas de paramétrage pour l'usage courant. Seuls les tools cartographiques (`*_layer`) nécessitent en plus un proxy WFS joignable — voir « [Activer les tools cartographiques en local](dev.md#activer-les-tools-cartographiques-en-local) ».
- **Cette section concerne les développeurs du MCP et les utilisateurs avancés du MCP** (démarrer localement la version HTTP, configurer les logs,...)

## Principaux paramètres

| Nom                          | Description                                                                                                                                                                                                                                                                                       | Valeur par défaut                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `TRANSPORT_TYPE`             | [Transport](https://mcp-framework.com/docs/Transports/transports-overview) permet de choisir entre "stdio" et "http"                                                                                                                                                                              | "stdio" (version locale) / "http" (docker)       |
| `HTTP_HOST`                  | Adresse d'écoute en mode HTTP. Utile avec Docker pour exposer le service via `0.0.0.0`.                                                                                                                                                                                                           | "127.0.0.1"                                      |
| `HTTP_PORT`                  | Port d'écoute du MCP                                                                                                                                                                                                                                                                              | 3000                                             |
| `HTTP_MCP_ENDPOINT`          | Chemin d'exposition du MCP en HTTP                                                                                                                                                                                                                                                                | "/mcp"                                           |
| `HTTP_CORS_ALLOWED_ORIGINS`  | Permet la [configuration de allowedOrigins pour protection contre les attaques par DNS rebinding](https://www.mcp-framework.com/docs/transports/http-stream#origin-validation-dns-rebinding-protection). Exemple : `HTTP_CORS_ALLOWED_ORIGINS="http://localhost:3000,https://geollm.beta.ign.fr"` | Aucun (warning)                                  |
| `HTTP_TIMEOUT`               | Délai maximal, en secondes, pour les appels HTTP sortants vers les services amont IGN. Au-delà, la requête est interrompue et l'outil renvoie une erreur de timeout structurée.                                                                                                                   | `15`                                             |
| `GPF_WFS_RATE_LIMIT`         | Nombre maximum de requêtes par seconde sur le WFS de la Géoplateforme.                                                                                                                                                                                                                            | 30                                               |
| `GPF_GEOCODE_RATE_LIMIT`     | Nombre maximum de requêtes par seconde sur le service d'autocomplétion de la Géoplateforme.                                                                                                                                                                                                       | 50                                               |
| `GPF_ALTI_RATE_LIMIT`        | Nombre maximum de requêtes par seconde sur le service d'altimétrie de la Géoplateforme.                                                                                                                                                                                                           | 50                                               |
| `GPF_NAVIGATION_RATE_LIMIT`  | Nombre maximum de requêtes par seconde sur le service d'isochrone/navigation de la Géoplateforme.                                                                                                                                                                                                 | 5                                                |
| `GPF_WFS_MINISEARCH_OPTIONS` | Chaîne JSON optionnelle permettant de configurer `gpf_search_types`.                                                                                                                                                                                                                          | options par défaut de `@ignfab/gpf-schema-store` |
| `LOG_FORMAT`                 | Le format d'écriture des logs : "json" ou "simple".                                                                                                                                                                                                                                               | "simple"                                         |
| `LOG_LEVEL`                  | Le niveau d'écriture des logs : ["error", "info", ou "debug"](https://github.com/winstonjs/winston#logging-levels)                                                                                                                                                                                | "debug"                                          |
| `PROXY_URL_SECRET`           | Clé symétrique (32 octets, en hexadécimal) utilisée pour chiffrer les URLs opaques du proxy WFS. **Requise dès que les tools cartographiques (`*_layer`) sont utilisés**, indépendamment du transport : la même clé sert au MCP (pour signer l'URL) et au proxy (pour la déchiffrer). Voir [Génération de `PROXY_URL_SECRET`](#génération-de-proxy_url_secret).                                                                     | Aucune                                           |
| `PROXY_MAX_RESPONSE_BYTES`   | Taille maximale, en octets, d'une réponse GeoJSON servie par le proxy WFS. Au-delà, la réponse est interrompue et une erreur est renvoyée (garde-fou réseau et rendu cartographique). Pour l'affichage, préférer les variantes cartographiques généralisées (moins volumineuses).                 | `26214400` (25 Mio)                              |
| `PROXY_PORT`                 | Port d'écoute du serveur proxy WFS. Le proxy est un **processus séparé** du MCP (`dist/proxy/index.js`), avec son propre port.                                                                                                                                                                                                            | `3002`                                           |
| `PROXY_ENDPOINT`             | Chemin exposé par le proxy WFS.                                                                                                                                                                                                                                                                   | `/api/v1/proxy-wfs`                              |
| `PROXY_PUBLIC_BASE_URL`      | URL de base publiquement joignable du proxy, utilisée pour construire l'`data_url` absolue transmise à Carto. Derrière un reverse-proxy, elle diffère de l'adresse d'écoute ; en développement local, c'est typiquement `http://localhost:3002`. Requise avec `PROXY_URL_SECRET` pour activer les tools `*_layer`.                                                                                                                       | Aucune                                           |
| `GPF_WFS_PROXY_RATE_LIMIT`   | Limite de requêtes/s du proxy vers le WFS, distincte de `GPF_WFS_RATE_LIMIT`. Les deux comptent sur le même service IGN : répartir une seule allocation entre les deux.                                                                                                                            | `10`                                             |
| `GPF_NAVIGATION_PROXY_RATE_LIMIT` | Limite de requêtes/s du proxy vers le service d'isochrone (filtre `travel_time`), distincte de `GPF_NAVIGATION_RATE_LIMIT`. Les deux comptent sur le même service IGN : répartir une seule allocation entre les deux.                                                                         | `5`                                              |
| `PROXY_UPSTREAM_TIMEOUT`     | Délai (secondes) des appels amont du proxy (WFS **et** isochrone), plus court que `HTTP_TIMEOUT` pour qu'une requête à 2 appels (`intersects_feature` ou `travel_time`) reste sous le délai du navigateur/Carto.                                                                                   | `10`                                             |

## Génération de `PROXY_URL_SECRET`

Pour produire des URLs opaques d'affichage cartographique (tools `gpf_get_features_layer` et `gpf_get_feature_by_id_layer`), geocontext chiffre les paramètres de requête avec une clé symétrique AES-256, fournie via `PROXY_URL_SECRET`. La même clé est utilisée par le MCP (pour signer) et par le proxy WFS (pour déchiffrer).

La clé doit être une valeur aléatoire de **32 octets encodée en hexadécimal** (soit 64 caractères `0-9a-f`). Générez-la avec :

```bash
openssl rand -hex 32
```

Points importants :

- **La clé doit être stable et partagée** entre toutes les instances du serveur. Elle est typiquement stockée comme *Secret* (par exemple un `Secret` Kubernetes) puis injectée dans la variable d'environnement `PROXY_URL_SECRET`.
- **Remplacer la clé rend inutilisables les URLs déjà générées** : une URL opaque produite avec l'ancienne clé ne peut plus être déchiffrée par le serveur, qui répond alors par une erreur au lieu de la carte. Toute URL déjà transmise à un utilisateur (partagée dans une conversation, mise en favori, chargée dans Carto) cesse donc de fonctionner. À prendre en compte lors d'une rotation de clé.
- **Ce sont la clé et `PROXY_PUBLIC_BASE_URL` qui conditionnent la disponibilité des tools `*_layer`, pas le transport.** Ces tools sont *listés* dans tous les transports mais échouent proprement tant qu'un proxy joignable n'est pas configuré (les deux variables absentes) — sans proxy, utiliser `gpf_get_features` / `gpf_get_feature_by_id`. Le proxy WFS étant un **processus séparé**, un MCP en `stdio` pointé vers un proxy lancé localement active les tools `*_layer` exactement comme le déploiement `http` (voir le [guide développeur](dev.md)). Si vous définissez la clé, elle doit rester un hexadécimal de 64 caractères valide : une valeur mal formée est rejetée au démarrage quel que soit le transport.

L'image Docker fixe `TRANSPORT_TYPE=http` : `PROXY_URL_SECRET` y est donc obligatoire. La clé doit être générée **une seule fois lors du provisionnement initial**, puis conservée pour tous les démarrages suivants. Ne relancez pas `openssl rand` avant chaque `docker compose up`, car cela effectuerait une rotation de clé et invaliderait les URLs existantes (faible impact).

Pour un déploiement local avec Docker Compose, générez d'abord la clé :

```bash
openssl rand -hex 32
```

Enregistrez ensuite la valeur obtenue dans le fichier `.env`, ignoré par Git :

```dotenv
PROXY_URL_SECRET=<valeur générée ci-dessus>
```

Docker Compose charge automatiquement ce fichier pour `up`, `stop`, `down` et `config`. Réutilisez toujours la vraie clé ; n'employez pas de valeur temporaire ou factice pour les commandes d'administration, car elle pourrait être réutilisée par erreur lors d'un prochain `up`. En production, stockez plutôt la clé dans le gestionnaire de secrets de la plateforme.

Si la variable est absente, `docker compose` s'arrête avec un message explicite avant de démarrer le conteneur.

## Paramétrages avancés

- [Configuration d'un proxy d'entreprise](config/proxy.md)
- [Configurer le moteur de recherche](config/minisearch.md)
