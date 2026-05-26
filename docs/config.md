# Configuration du serveur MCP

## Points clés

- L'utilisation du MCP sous forme d'un processus local (`npx -y @ignfab/geocontext`) ne requiert pas de paramétrage.
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
| `GPF_WFS_MINISEARCH_OPTIONS` | Chaîne JSON optionnelle permettant de configurer `gpf_wfs_search_types`.                                                                                                                                                                                                                          | options par défaut de `@ignfab/gpf-schema-store` |
| `LOG_FORMAT`                 | Le format d'écriture des logs : "json" ou "simple".                                                                                                                                                                                                                                               | "simple"                                         |
| `LOG_LEVEL`                  | Le niveau d'écriture des logs : ["error", "info", ou "debug"](https://github.com/winstonjs/winston#logging-levels)                                                                                                                                                                                | "debug"                                          |

## Paramétrages avancés

- [Configuration d'un proxy d'entreprise](config/proxy.md)
- [Configurer le moteur de recherche](config/minisearch.md)
