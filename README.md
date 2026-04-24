<p align="center">
  <img src="docs/imgs/hexagon-geoctx.svg" alt="logo du projet geocontext" width="300">
</p>

# Geocontext

Serveur MCP expérimental fournissant du contexte spatial pour les LLM sur la base des [services de la Géoplateforme de l'IGN](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme).

## Motivation

Les LLM peuvent donner l'impression de disposer nativement de certaines capacités, mais ils dépendent, en pratique, des outils qui leur sont connectés. Par exemple, pour accéder à la date et à l'heure, un assistant doit être interfacé avec un serveur comme [MCP time](https://mcpservers.org/servers/modelcontextprotocol/time). De la même manière, pour lire une page web, il doit être relié à un outil tel que [MCP fetch](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch#readme).

S'il est techniquement possible de brancher des API REST/GeoJSON telle [APICARTO](https://github.com/IGNF/apicarto) à un LLM, la conception de ces dernières n'est pas adaptée (5000 résultat par défaut, grosse géométrie dans les réponses, géométries complexes à fournir,...).

L'idée est ici d'**expérimenter la conception d'un MCP rendant les données et les services de la Géoplateforme accessibles par un LLM**.

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

## Utilisation

### Utilisation de la version publiée

Par exemple, avec "Cursor Settings / MCP / Add server" :

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

### Utilisation avec Docker

```bash
docker compose build
docker compose up -d
```

Ensuite :

```json
{
  "mcpServers": {
    "geocontext": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Développement

### Construction de la version locale

```bash
git clone https://github.com/ignfab/geocontext
cd geocontext
npm install
npm run build
```

### Utilisation de la version locale

#### Avec un client MCP compatible JSON

```json
{
  "mcpServers": {
    "geocontext": {
      "command": "node",
      "args":["/chemin/absolu/vers/geocontext/dist/index.js"]
    }
  }
}
```

### Debug de la version locale

Cette commande lance **MCP Inspector**, l’outil de développement de MCP pour tester et déboguer un serveur local. 

```bash
npx -y @modelcontextprotocol/inspector node dist/index.js
```

## Paramétrage

Pour une utilisation avancée :

| Nom                          | Description                                                                                                                                                                                                                                                            | Valeur par défaut                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `TRANSPORT_TYPE`             | [Transport](https://mcp-framework.com/docs/Transports/transports-overview) permet de choisir entre "stdio" et "http"                                                                                                                                                   | "stdio"                                          |
| `HTTP_HOST`                  | Adresse d'écoute en mode HTTP. Utile avec Docker pour exposer le service via `0.0.0.0`.                                                                                                                                                                                | défaut `mcp-framework` (`127.0.0.1`)             |
| `GPF_WFS_MINISEARCH_OPTIONS` | Chaîne JSON optionnelle pour ajuster les options MiniSearch utilisées par `gpf_wfs_search_types` (`fields`, `combineWith`, `fuzzy`, `boost.namespace`, `boost.name`, `boost.title`, `boost.description`, `boost.properties`, `boost.enums`, `boost.identifierTokens`). | options par défaut de `@ignfab/gpf-schema-store` |
| `LOG_FORMAT`                 | Le format d'écriture des logs : "json" ou "simple".                                                                                                                                                                                                                    | "simple"                                         |
| `LOG_LEVEL`                  | Le niveau d'écriture des logs : ["error", "info", ou "debug"](https://github.com/winstonjs/winston#logging-levels)                                                                                                                                                     | "debug"                                          |

Exemple :

```bash
export GPF_WFS_MINISEARCH_OPTIONS='{"fields":["title","identifierTokens"],"combineWith":"OR","fuzzy":0.05,"boost":{"title":4,"name":5}}'
```

Si `GPF_WFS_MINISEARCH_OPTIONS` est absent ou vide, les options par défaut restent celles de `@ignfab/gpf-schema-store`, y compris le comportement par défaut `OR` de MiniSearch pour `combineWith`.

Remarque :

- Les outils `gpf_wfs_search_types` et `gpf_wfs_describe_type` s'appuient sur un catalogue de schémas embarqué fourni par `@ignfab/gpf-schema-store`.
- Les outils `gpf_wfs_get_features` et `gpf_wfs_get_feature_by_id` interrogent toujours le service WFS de la Géoplateforme en direct.
- Le catalogue embarqué améliore la description des featureTypes mais il peut être légèrement décalé par rapport à l'état courant du WFS.

## Fonctionnalités

Une description avancée des tools équivalente au niveau de détail de la méthode `tools/list` est disponible [ici](docs/mcp-tools.md).  
On décrit ci-dessous succinctement les différents `tools` MCP proposés par `geocontext`.

### Utiliser des services spatiaux

* [geocode(text)](src/tools/GeocodeTool.ts) s'appuie sur le [service d’autocomplétion de la Géoplateforme](https://geoservices.ign.fr/documentation/services/services-geoplateforme/autocompletion) pour **convertir un nom de lieu en position (lon,lat)**.

> Ex : Quelle est la position (lon,lat) de la mairie de Vincennes?

* [altitude(lon,lat)](src/tools/AltitudeTool.ts) s'appuie sur le [service de calcul altimétrique de la Géoplateforme](https://geoservices.ign.fr/documentation/services/services-geoplateforme/altimetrie) pour **convertir une position en altitude**. 

> Ex : Quelle est l'altitude de la mairie de Loray (25)?

### Recherche d'informations pour un lieu

L'idée est ici de répondre à des questions précises en traitant côté serveur les appels aux [services WFS de la Géoplateforme](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/diffusion/wfs/) :

* [adminexpress(lon,lat)](src/tools/AdminexpressTool.ts) permet de **récupérer les informations administratives (commune, département, région,...)** pour un lieu donné par sa position.

> Ex : Quelles sont les informations administrative pour la mairie de Vincennes?

* [cadastre(lon,lat)](src/tools/CadastreTool.ts) permet de **récupérer les informations cadastrales (parcelle, feuille,...)**.

> Ex : Quelles sont les informations du cadastre pour la mairie de Vincennes?

* [urbanisme(lon,lat)](src/tools/UrbanismeTool.ts) permet de **récupérer les informations d'urbanisme (PLU,POS,CC,PSMV)**

> Ex : Quel est le document PLU en vigueur pour le port de Marseille?

* [assiette_sup(lon,lat)](src/tools/AssietteSupTool.ts) permet de **récupérer les Servitude d'Utilité Publiques (SUP)**

> Ex: Quelles assiettes de SUP sont présentes autour de la mairie de Vincennes ?

Les tools WFS orientés "objet" (`adminexpress`, `cadastre`, `urbanisme`, `assiette_sup`) exposent un `feature_ref { typename, feature_id }` quand l'objet source est réutilisable tel quel dans un appel ultérieur à `gpf_wfs_get_feature_by_id` ou `gpf_wfs_get_features` (ex : `spatial_operator="intersects_feature"`).

### Explorer les données vecteurs

#### Explorer les tables

* [gpf_wfs_search_types(keywords,max_results=10)](src/tools/GpfWfsSearchTypesTool.ts) pour **rechercher un type WFS pertinent à partir de mots-clés et obtenir un `typename` valide**. La recherche est textuelle et configurable via `GPF_WFS_MINISEARCH_OPTIONS`.

> - Quels sont les millésimes ADMINEXPRESS disponibles sur la Géoplateforme?
> - Quelle est la table de la BDTOPO correspondant aux bâtiments?
> - Dans quelle table de la BDTOPO peut-on trouver les ponts?

#### Explorer la structure des tables

* [gpf_wfs_describe_type(typename)](src/tools/GpfWfsDescribeTypeTool.ts) pour récupérer le **schéma détaillé d'un type WFS** depuis le catalogue embarqué (`id`, `namespace`, `name`, `title`, `description`, `properties`), en particulier avant d'appeler `gpf_wfs_get_features`

> - Quelles sont les informations disponibles pour les communes avec ADMINEXPRESS-COG.LATEST?
> - Compare le modèle des communes entre ADMINEXPRESS-COG:2024 et ADMINEXPRESS-COG.LATEST

#### Explorer les données des tables

* [gpf_wfs_get_feature_by_id(typename,feature_id,...)](src/tools/GpfWfsGetFeatureByIdTool.ts) pour **récupérer exactement un objet WFS identifié par son `feature_id`**.

Le tool accepte un contrat structuré :

- `select` pour choisir les propriétés à renvoyer
- `result_type="request"` pour récupérer la requête compilée (`POST` + `get_url` éventuelle) pour utilisation par un autre tool (ex: affichage cartographique)
- `result_type="results"` pour renvoyer une `FeatureCollection` normalisée contenant exactement un seul objet

Exemple :

- `typename="ADMINEXPRESS-COG.LATEST:commune", feature_id="commune.8952"`

* [gpf_wfs_get_features(typename,...)](src/tools/GpfWfsGetFeaturesTool.ts) pour **récupérer les données d'une table** depuis le service WFS de la Géoplateforme sans écrire de CQL à la main.

Le tool accepte un contrat structuré :

- `select` pour choisir les propriétés à renvoyer
- `where` pour filtrer les objets
- `order_by` pour trier les résultats
- `spatial_operator` et ses paramètres dédiés pour le spatial
- `result_type="request"` pour récupérer la requête compilée en `POST`, ainsi qu'une `get_url` dérivée quand elle reste raisonnablement portable en GET

Exemples :

- `where=[{ property: "code_insee", operator: "eq", value: "25000" }]`
- `spatial_operator="bbox"` avec `bbox_west`, `bbox_south`, `bbox_east`, `bbox_north`
- `spatial_operator="dwithin_point"` avec `dwithin_lon`, `dwithin_lat`, `dwithin_distance_m`
- `spatial_operator="intersects_feature"` avec `intersects_feature_typename` et `intersects_feature_id` issus d'une `feature_ref`

> - Quelles sont les 5 communes les plus peuplées du Doubs (25)?
> - Combien y-a-t'il de bâtiments à moins de 5 km de la tour Eiffel?

## Contribution

### Problèmes et demandes d'évolutions

N'hésitez pas à [créer une issue](https://github.com/ignfab/geocontext/issues) si vous rencontrez un problème! Merci de fournir :

- L'assistant (ex: Github Copilot) et le modèle utilisé (ex: Claude Sonnet 4.5)
- La demande que vous faite à l'assistant (ex : "Combien y a-t'il de pont franchissant la Seine?")

### Proposer une nouvelle fonctionnalité

N'hésitez pas :

- Forker le dépôt
- Créer un nouveau tool
- Tester de votre côté
- Faire une pull-request

## Crédits

* [mcp-framework](https://mcp-framework.com) fournit le **cadre de développement du MCP** 
* [@ignfab/gpf-schema-store](https://www.npmjs.com/package/@ignfab/gpf-schema-store) pour le **catalogue de schémas embarqué** utilisé par les outils d'exploration WFS.
* [MiniSearch](https://github.com/lucaong/minisearch) pour la **recherche par mot clé** utilisée dans `@ignfab/gpf-schema-store`.
* [jsts](https://bjornharrtell.github.io/jsts/) pour les **traitements géométriques** (ex : tri des réponses par distance au point recherché).
* [turfjs/distance](https://turfjs.org/docs/api/distance) pour les **calculs de distance** avec la [formule de Haversine](https://en.wikipedia.org/wiki/Haversine_formula).

## Licence

[MIT](LICENSE)
