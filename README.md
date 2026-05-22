<p align="center">
  <img src="docs/imgs/hexagon-geoctx.svg" alt="logo du projet geocontext" height="64">
</p>

# Geocontext

Ce serveur MCP expérimental a pour objectif de **rendre accessible par un LLM les services et les données publiées sur la [Géoplateforme de l'IGN](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme)** pour faciliter la **découverte et l'utilisation des données disponibles** :

![Bâtiment de plus de 20 mètres à Vincennes](docs/imgs/batiment-30m-vincennes.png)

## Points clés

- **Pas de duplication des données** pour accès aux données géographiques françaises de référence à jour.
- **Adaptation des services existants pour une utilisation efficace par les LLM** pour réduction des tokens / coûts (réponses légères, filtrage par géométrie -> filtrage par référence,...)
- **Amélioration la description des données** pour réduire le risque d'hallucination et faciliter la découverte des donnnées (implémentation anticipée de [OGC API Feature - schema](https://docs.ogc.org/is/23-058r2/23-058r2.html))

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


## Contribution

### Signaler un problème

N'hésitez pas à [créer une issue](https://github.com/ignfab/geocontext/issues) si vous rencontrez un problème! 

**Merci de fournir** :

- L'**assistant** (ex: Github Copilot) et le modèle utilisé (ex: Claude Sonnet 4.5)
- La **demande** que vous faites à l'assistant (**ex : "Combien y a-t-il de pont franchissant la Seine?"**)
- Si possible, un export de la discussion au format Markdown.

### Demander une évolution

N'hésitez pas non plus à [créer une issue](https://github.com/ignfab/geocontext/issues) pour demander une évolution.

Merci de **fournir la question type** pour laquelle vous souhaiteriez que le MCP aide à apporter une réponse. Par exemple :

- "Combien y a-t'il de bâtiments à moins de 5 km à pied de la tour Eiffel?" -> nous verrons comment exploiter les isochrones
- "Quelles sont les fonds de carte disponibles?" -> nous verrons comment exploiter le service WMTS de la Géoplateforme.


## Mises en garde

- Ce développement est un prototype en incubation au sein d'[IGNfab](https://www.ign.fr/ignfab) sur la base d'un premier [prototype désormais archivé](https://github.com/mborne/geocontext)
- S'il s'avère utile de l'industrialiser, le dépôt sera migré dans l'[organisation IGN principale](https://github.com/ignf) et l'outil sera renommé (ex : `IGNF/mcp-gpf-server`)
- 🪄 Cet outil ne relève pas de la magie : ses capacités sont définies et documentées dans [Fonctionnalités](#fonctionnalités).


## Paramétrage

Voir [configuration du serveur MCP](docs/config.md) pour les configurations avancées (configuration d'un proxy d'entreprise, choix du mode de transport : stdio/http,...)

## Développement

Voir [Guide développeur](docs/dev.md) pour installation des dépendances, construction de l'application, exécution des tests,...

## Crédits

* [mcp-framework](https://mcp-framework.com) : **cadre de développement du MCP** 
* [@ignfab/gpf-schema-store](https://www.npmjs.com/package/@ignfab/gpf-schema-store) : **couche sémantique** / **catalogue de schémas embarqué** (en attendant [OGC API - Features - schema](https://docs.ogc.org/is/23-058r2/23-058r2.html))
    * [@camptocamp/ogc-client](https://camptocamp.github.io/ogc-client/#/) : **exploration WFS** (ex : parsing [GetCapabilities](https://data.geopf.fr/wfs?request=GetCapabilities&version=2.0.0&service=WFS))
    * [MiniSearch](https://github.com/lucaong/minisearch) : **recherche par mot clé** (`gpf_wfs_search_types`)
* [jsts](https://bjornharrtell.github.io/jsts/) pour les **traitements géométriques** (ex : tri des réponses par distance au point recherché).
* [turfjs/distance](https://turfjs.org/docs/api/distance) pour les **calculs de distance** avec la [formule de Haversine](https://en.wikipedia.org/wiki/Haversine_formula).

## Voir également

- https://github.com/datagouv/datagouv-mcp : MCP data.gouv.fr
- https://git.tricoteuses.fr/logiciels/tricoteuses-api-parlement :  MCP parlement français non officiel
- https://github.com/datagouv/datagouv-skill : Skills data.gouv.fr

## Licence

[MIT](LICENSE)
