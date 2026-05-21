<p align="center">
  <img src="docs/imgs/hexagon-geoctx.svg" alt="logo du projet geocontext" width="300">
</p>

# Geocontext

Serveur MCP expérimental rendant les [services de la Géoplateforme de l'IGN](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme) accessibles par un LLM.

## Démarrage rapide

### Version HTTP

**En approche...**

### Version locale

Le MCP peut être démarré en tant que MCP local à l'aide de la commande `npx -y @ignfab/geocontext` qui démarrera la dernière version publiées (voir [@ignfab/geocontext](https://www.npmjs.com/package/@ignfab/geocontext)).

La méthode varie en fonction des clients. Par exemple, avec "Cursor Settings / MCP / Add server" :

```json
{
  "mcpServers": {
    "geocontext": {
      "command": "npx",
      "args": ["-y", "@ignfab/geocontext"]
    }
  }
}
```

### Autres exemples d'utilisation

- [Exemple d'utilisation avec Claude Desktop](docs/usage/claude-desktop.md)
- [Exemple d'utilisation avec MCPJam](docs/usage/mcpjam.md)

## Fonctionnalités (Tools)

👉 Une description avancée des tools équivalente au niveau de détail de la méthode `tools/list` est disponible [ici](docs/mcp-tools.md).  
On décrit ci-dessous succinctement les différents `tools` MCP proposés par `geocontext`.

### Utiliser des services spatiaux

* [geocode(text)](docs/mcp-tools.md#geocode) s'appuie sur le [service d’autocomplétion de la Géoplateforme](https://geoservices.ign.fr/documentation/services/services-geoplateforme/autocompletion) pour **convertir un nom de lieu en position (lon,lat)**.

> Ex : Quelle est la position (lon,lat) de la mairie de Vincennes?

* [altitude(lon,lat)](docs/mcp-tools.md#altitude) s'appuie sur le [service de calcul altimétrique de la Géoplateforme](https://geoservices.ign.fr/documentation/services/services-geoplateforme/altimetrie) pour **convertir une position en altitude**. 

> Ex : Quelle est l'altitude de la mairie de Loray (25)?

### Recherche d'informations pour un lieu

L'idée est ici de répondre à des questions précises en traitant côté serveur les appels aux [services WFS de la Géoplateforme](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/diffusion/wfs/) :

* [adminexpress(lon,lat)](docs/mcp-tools.md#adminexpress) permet de **récupérer les informations administratives (commune, département, région,...)** pour un lieu donné par sa position.

> Ex : Quelles sont les informations administratives pour la mairie de Vincennes?

* [cadastre(lon,lat)](docs/mcp-tools.md#cadastre) permet de **récupérer les informations cadastrales (parcelle, feuille,...)**.

> Ex : Quelles sont les informations du cadastre pour la mairie de Vincennes?

* [urbanisme(lon,lat)](docs/mcp-tools.md#urbanisme) permet de **récupérer les informations d'urbanisme (PLU,POS,CC,PSMV)**

> Ex : Quel est le document PLU en vigueur pour le port de Marseille?

* [assiette_sup(lon,lat)](docs/mcp-tools.md#assiette_sup) permet de **récupérer les Servitudes d'Utilité Publique (SUP)**

> Ex: Quelles assiettes de SUP sont présentes autour de la mairie de Vincennes ?

### Explorer les données vecteurs

#### Explorer les tables

* [gpf_wfs_search_types(keywords,max_results=10)](docs/mcp-tools.md#gpf_wfs_search_types) pour **rechercher un type WFS pertinent à partir de mots-clés**.

> - Quels sont les millésimes ADMINEXPRESS disponibles sur la Géoplateforme?
> - Quelle est la table de la BDTOPO correspondant aux bâtiments?
> - Dans quelle table de la BDTOPO peut-on trouver les ponts?

#### Explorer la structure des tables

* [gpf_wfs_describe_type(typename)](docs/mcp-tools.md#gpf_wfs_describe_type) pour récupérer le **schéma détaillé d'un type WFS** depuis le catalogue embarqué (`id`, `namespace`, `name`, `title`, `description`, `properties`), en particulier avant d'appeler `gpf_wfs_get_features`

> - Quelles sont les informations disponibles pour les communes avec ADMINEXPRESS-COG.LATEST?
> - Compare le modèle des communes entre ADMINEXPRESS-COG:2024 et ADMINEXPRESS-COG.LATEST

#### Explorer les données des tables

* [gpf_wfs_get_features(typename,...)](docs/mcp-tools.md#gpf_wfs_get_features) pour **récupérer les données d'une table** depuis le service WFS de la Géoplateforme.

> - Quelles sont les 5 communes les plus peuplées du Doubs (25)?
> - Combien y a-t-il de bâtiments à moins de 5 km de la tour Eiffel?

* [gpf_wfs_get_feature_by_id(typename,feature_id,...)](docs/mcp-tools.md#gpf_wfs_get_feature_by_id) pour **récupérer exactement un objet WFS identifié par son `feature_id`**.

## Paramétrage

Cette section concerne les développeurs du MCP et les utilisateurs avancés du MCP local.

| Nom                          | Description                                                                                                                                                                                                                                                                                       | Valeur par défaut                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `TRANSPORT_TYPE`             | [Transport](https://mcp-framework.com/docs/Transports/transports-overview) permet de choisir entre "stdio" et "http"                                                                                                                                                                              | "stdio" (version locale) / "http" (docker)       |
| `HTTP_HOST`                  | Adresse d'écoute en mode HTTP. Utile avec Docker pour exposer le service via `0.0.0.0`.                                                                                                                                                                                                           | "127.0.0.1"                                      |
| `HTTP_PORT`                  | Port d'écoute du MCP                                                                                                                                                                                                                                                                              | 3000                                             |
| `HTTP_MCP_ENDPOINT`          | Chemin d'exposition du MCP en HTTP                                                                                                                                                                                                                                                                | "/mcp"                                           |
| `HTTP_CORS_ALLOWED_ORIGINS`  | Permet la [configuration de allowedOrigins pour protection contre les attaques par DNS rebinding](https://www.mcp-framework.com/docs/transports/http-stream#origin-validation-dns-rebinding-protection). Exemple : `HTTP_CORS_ALLOWED_ORIGINS="http://localhost:3000,https://geollm.beta.ign.fr"` | Aucun (warning)                                  |
| `HTTP_TIMEOUT`               | Délai maximal, en secondes, pour les appels HTTP sortants vers les services amont IGN. Au-delà, la requête est interrompue et l'outil renvoie une erreur de timeout structurée.                                                                                                                   | `15`                                             |
| `GPF_WFS_RATE_LIMIT`         | Nombre maximum de requêtes par seconde sur le WFS de la Géoplateforme.                                                                                                                                                                                                                            | 30                                               |
| `GPF_WFS_MINISEARCH_OPTIONS` | Chaîne JSON optionnelle permettant de  `gpf_wfs_search_types`                                                                                                                                                                                                                                     | options par défaut de `@ignfab/gpf-schema-store` |
| `LOG_FORMAT`                 | Le format d'écriture des logs : "json" ou "simple".                                                                                                                                                                                                                                               | "simple"                                         |
| `LOG_LEVEL`                  | Le niveau d'écriture des logs : ["error", "info", ou "debug"](https://github.com/winstonjs/winston#logging-levels)                                                                                                                                                                                | "debug"                                          |

Avancés :

- [Configuration d'un proxy d'entreprise](docs/config/proxy.md)
- [Configurer le moteur de recherche](docs/config/minisearch.md)


## Voir également

- https://github.com/datagouv/datagouv-mcp : MCP data.gouv.fr
- https://github.com/mapbox/mcp-server : MCP Mapbox
- https://git.tricoteuses.fr/logiciels/tricoteuses-api-parlement :  MCP parlement français non officiel
- https://github.com/datagouv/datagouv-skill : Skills data.gouv.fr

## Contribution

### Problèmes et demandes d'évolutions

N'hésitez pas à [créer une issue](https://github.com/ignfab/geocontext/issues) si vous rencontrez un problème! Merci de fournir :

- L'assistant (ex: Github Copilot) et le modèle utilisé (ex: Claude Sonnet 4.5)
- La demande que vous faites à l'assistant (ex : "Combien y a-t-il de pont franchissant la Seine?")

### Proposer une nouvelle fonctionnalité

N'hésitez pas :

- Forker le dépôt
- Créer un nouveau tool
- Tester de votre côté
- Faire une pull-request


## Mises en garde

- Ce développement est un POC en incubation au sein d'[IGNfab](https://www.ign.fr/ignfab) sur la base d'un premier [prototype désormais archivé](https://github.com/mborne/geocontext)
- S'il s'avère utile de l'industrialiser, ce dépôt sera migré dans l'[organisation IGN principale](https://github.com/ignf) et l'outil sera renommé (ex : `IGNF/mcp-gpf-server`)
- Les [issues](https://github.com/ignfab/geocontext/issues) sont régulièrement mises à jour et traitées
- Une [roadmap](https://github.com/ignfab/geocontext/wiki) est également régulièrement alimentée
- 🪄 Cet outil ne relève pas de la magie : ses capacités sont définies et documentées dans [Fonctionnalités](#fonctionnalités).

## Principes de conception

- **Ne pas répliquer les données de la Géoplateforme** (objectif : concentrer les efforts sur l'amélioration des services existants plutôt que sur leur duplication)
- **Prototyper les capacités manquantes pour l'usage des LLM avec la Géoplateforme** (objectif : combler les briques techniques nécessaires à une intégration robuste). Le projet s'appuie notamment sur [gpf-schema-store](https://github.com/ignfab/gpf-schema-store/) pour l'indexation et la description des schémas.
- **Maîtriser la volumétrie des réponses** (objectif : réduire le coût en jetons, limiter les hallucinations et permettre l'utilisation de modèles locaux). Cela se traduit en pratique par l'utilisation de références légères (`feature_ref`) aux objets géométriques dans les réponses et outils du MCP.

## Crédits

* [mcp-framework](https://mcp-framework.com) fournit le **cadre de développement du MCP** 
* [@ignfab/gpf-schema-store](https://www.npmjs.com/package/@ignfab/gpf-schema-store) pour le **catalogue de schémas embarqué** utilisé par les outils d'exploration WFS.
* [MiniSearch](https://github.com/lucaong/minisearch) pour la **recherche par mot clé** utilisée dans `@ignfab/gpf-schema-store`.
* [jsts](https://bjornharrtell.github.io/jsts/) pour les **traitements géométriques** (ex : tri des réponses par distance au point recherché).
* [turfjs/distance](https://turfjs.org/docs/api/distance) pour les **calculs de distance** avec la [formule de Haversine](https://en.wikipedia.org/wiki/Haversine_formula).

## Licence

[MIT](LICENSE)
