# geocontext

Un serveur MCP expérimental fournissant du contexte spatial pour les LLM.

## Motivation

Les LLM renforcent l'idée que la magie est possible avec l'informatique. Il n'en est rien. Pour qu'un assistant soit en mesure de connaître la date et l'heure, il faut par exemple l'interfacer avec un [MCP time](https://mcpservers.org/servers/modelcontextprotocol/time). De même, pour qu'il soit en mesure de lire une page, il faut par exemple l'interfacer un [MCP fetch](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch#readme).

En matière de données géographique, si un utilisateur pose une question impliquant que l'assistant soit en mesure de [connaître la position d'une adresse, il y a de bonne chance que la réponse soit plausible mais fausse](https://github.com/mborne/llm-experimentations/tree/main/chatgpt-geocodage-limites#readme).

S'il est techniquement possible de brancher des API REST/GeoJSON telle APICARTO, la conception de ces dernières n'est pas adaptée (5000 résultat par défaut, grosse géométrie dans les réponses, géométries complexes à fournir,...).

L'idée est ici d'**expérimenter la conception d'un MCP rendant les données et les services de la Géoplateforme accessibles par un LLM**.

## Mises en garde

- Ce développement a été initié à titre personnel en mode POC et il n'a pas vocation a être industrialisé sous sa forme actuelle.
- S'il s'avère utile de l'industrialiser, le dépôt sera migré sous responsabilité IGN et l'outil sera renommé (ex : `IGNF/mcp-gpf-server`)
- Plusieurs problèmes et améliorations possibles ont été identifiés et sont en cours de mitigation/résolution (c.f. [issues](https://github.com/mborne/geocontext/issues?q=is%3Aissue%20state%3Aopen%20label%3Ametadata)).
- Cet outil n'est pas magique (voir [Fonctionnalités](#fonctionnalités) pour avoir une idée de ses capacités)

## Principes de conception

- **Ne pas copier les données de la Géoplateforme** (but : identifier les améliorations possibles sur le services plutôt que les doublonner)
- **Limiter au maximum la taille des réponses** (but : optimiser le nombre de jeton / éviter les hallucinations / pouvoir utiliser des modèles locaux)
- ...

## Utilisation

### Utilisation de la version publiée

Par exemple, avec "Cursor Settings / MCP / Add server" :

```json
{
  "mcpServers": {
    "geocontext": {
      "command": "npx",
      "args": ["-y", "@mborne/geocontext"]
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
    "server-name": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Développement

### Construction de la version locale

```bash
git clone https://github.com/mborne/geocontext
cd geocontext
npm install
npm run build
```

### Utilisation de la version locale

```json
{
  "mcpServers": {
    "mcp-helloworld": {
      "command": "node",
      "args":["/chemin/absolu/vers/geocontext/dist/index.js"]
    }
  }
}
```

### Debug de la version locale

```bash
npx -y @modelcontextprotocol/inspector node dist/index.js
```

## Paramétrage

Pour une utilisation avancée :

| Nom              | Description                                                                                                          | Valeur par défaut |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `TRANSPORT_TYPE` | [Transport](https://mcp-framework.com/docs/Transports/transports-overview) permet de choisir entre "stdio" et "http" | "stdio"           |

## Fonctionnalités

### Utiliser des services spatiaux

Quelques services de la Géoplateforme :

* [geocode(text)](src/tools/GeocodeTool.ts) s'appuie sur le [service d’autocomplétion de la Géoplateforme](https://geoservices.ign.fr/documentation/services/services-geoplateforme/autocompletion) pour **convertir un nom de lieu en position (lon,lat)**.

> Ex : Quelle est la position (lon,lat) de la mairie de Vincennes?

* [altitude(lon,lat)](src/tools/AltitudeTool.ts) s'appuie sur le [service de calcul altimétrique de la Géoplateforme](https://geoservices.ign.fr/documentation/services/services-geoplateforme/altimetrie) pour **convertir une position en altitude**. 

> Ex : Quelle est l'altitude de la mairie de Loray (25)?

### Recherche d'informations pour un lieu

L'idée est ici de répondre à des précises en traitant côté serveur les appels aux services WFS de la Géoplateforme :

* [adminexpress(lon,lat)](src/tools/AdminexpressTool.ts) permet de **récupérer les informations administratives (commune, département, région,...)** pour un lieu donné par sa position.

> Ex : Quelles sont les informations administrative pour la mairie de Vincennes?

* [cadastre(lon,lat)](src/tools/CadastreTool.ts) permet de **récupérer les informations cadastrales (parcelle, feuille,...)**.

> Ex : Quelles sont les informations du cadastre pour la mairie de Vincennes?

* [urbanisme(lon,lat)](src/tools/UrbanismeTool.ts) permet de **récupérer les informations d'urbanisme (PLU,POS,CC,PSMV)**

> Ex : Quel est le document PLU en vigueur pour le port de Marseille?

* [assiette_sup(lon,lat)](src/tools/AssietteSupTool.ts) permet de **récupérer les Servitude d'Utilité Publiques (SUP)**

### Explorer les données vecteurs

#### Explorer les tables

* [gpf_wfs_list_types()](src/tools/GpfWfsListTypesTool.ts) pour **lister les tables disponibles sur le WFS de la Géoplateforme** ([GetCapabilities](https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetCapabilities)) - **déprécié (trop de résultats)** 
* [gpf_wfs_search_types(keywords,max_results=10)](src/tools/GpfSearchFeatureTypes.ts) pour **rechercher les tables disponibles sur le WFS de la Géoplateforme** ([GetCapabilities](https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetCapabilities))

> - Quels sont les millésimes ADMINEXPRESS disponibles sur la Géoplateforme?
> - Quelle est la table de la BDTOPO correspondant aux bâtiments?
> - Dans quelle table de la BDTOPO peut-on trouver les ponts?

#### Explorer la structure des tables

* [gpf_wfs_describe_type(typename)](src/tools/GpfWfsDescribeTypeTool.ts) pour récupérer le **schéma d'une table** ([DescribeFeatureType](https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=DescribeFeatureType&typename=ADMINEXPRESS-COG.LATEST:commune&outputFormat=application/json))

> - Quelles sont les informations disponibles pour les communes avec ADMINEXPRESS-COG.LATEST?
> - Compare la structure de ADMINEXPRESS-COG commune pour toutes les versions disponibles

#### Explorer les données des tables

* [gpf_wfs_get_features(typename,...)](src/tools/GpfWfsGetFeaturesTool.ts) pour **récupérer les données d'une table** ([GetFeature](https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetFeature&typename=ADMINEXPRESS-COG.LATEST:commune&outputFormat=application/json&count=1))

> - Quelles sont les 5 communes les plus peuplées du Doubs (25)?
> - Combien y-a-t'il de bâtiments à moins de 5 km de la tour Eiffel?

## Contribution

### Problèmes et demandes d'évolutions

N'hésitez pas à [créer une issue](https://github.com/mborne/geocontext/issues) si vous rencontrez un problème! Merci de fournir :

- L'assistant et le modèle utilisé
- La demande que vous faite à l'assistant (ex : "Combien y a-t'il de pont franchissant la seine?")

### Proposer une nouvelle fonctionnalité

N'hésitez pas :

- Forker le dépôt
- Créer un nouveau tool
- Tester de votre côté
- Faire une pull-request



## Crédits

* [mcp-framework](https://mcp-framework.com) fournit le **cadre de développement du MCP** :

```bash
# Par exemple, pour exposer la liste des couches WMTS
mcp add tool gpf_wmts_layers
```

* [@camptocamp/ogc-client](https://camptocamp.github.io/ogc-client/#/) pour la **lecture des réponses XML des services WFS, WMTS,...**
* [MiniSearch](https://github.com/lucaong/minisearch) pour la **recherche par mot clé**.
* [jsts](https://bjornharrtell.github.io/jsts/) pour les **traitements géométriques** (ex : tri des réponses par distance au point recherché).

## Licence

[MIT](LICENSE)

