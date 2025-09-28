# geocontext

Un serveur MCP expérimental fournissant du contexte spatial pour les LLM.

## Motivation

Les assistants s'appuyant sur des LLM renforcent l'idée que la magie est possible avec l'informatique. Il n'en est rien. Pour qu'un assistant soit en mesure de fournir des réponses sur l'actualité, il faut par exemple l'interfacer avec un moteur de recherche à même de lui fournir les articles récents publiés dans les différents journaux.

A date, si un utilisateur pose une question impliquant que l'assistant soit en mesure de [connaître la position d'une adresse, il y a de bonne chance que la réponse soit plausible mais fausse](https://github.com/mborne/llm-experimentations/tree/main/chatgpt-geocodage-limites#readme).

S'il est techniquement possible de brancher des API REST/GeoJSON telle APICARTO, la conception de ces dernières n'est pas adaptée (5000 résultat par défaut, grosse géométrie dans les réponses, géométries complexes à fournir,...).

L'idée est ici d'**expérimenter la conception d'un MCP rendant les données et les services de la Géoplateforme accessibles par un LLM** (dans un premier temps).

## Mises en garde

- Ce développement a été initié à titre personnel en mode POC et il n'a pas vocation a être industrialisé sous sa forme actuelle.
- S'il s'avère utile de l'industrialiser, le dépôt sera migré sous responsabilité IGN et l'outil sera renommé (ex : `IGNF/mcp-gpf-server`)
- Plusieurs problèmes ont été identifiés et sont en cours de mitigation/résolution (c.f. [issues](https://github.com/mborne/geocontext/issues?q=is%3Aissue%20state%3Aopen%20label%3Ametadata)).
- Cet outil n'est pas magique (voir [Fonctionnalités](#fonctionnalités) pour avoir une idée de ses capacités)



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

> Quelle est la position (lon,lat) de la mairie de Vincennes?

* [altitude(lon,lat)](src/tools/AltitudeTool.ts) s'appuie sur le [service de calcul altimétrique de la Géoplateforme](https://geoservices.ign.fr/documentation/services/services-geoplateforme/altimetrie) pour **convertir une position en altitude**. 

> Ex : "Quelle est l'altitude de la mairie de Loray?"

### Recherche d'informations pour un lieu

L'idée est ici de répondre à des précises en traitant côté serveur les appels aux services WFS de la Géoplateforme :

* [adminexpress(lon,lat)](src/tools/AdminexpressTool.ts) permet de **récupérer les informations administratives (commune, département, région,...)** pour un lieu donné par sa position.
* [cadastre(lon,lat)](src/tools/CadastreTool.ts) permet de **récupérer les informations cadastrales (parcelle, feuille,...)**.
* [urbanisme(lon,lat)](src/tools/UrbanismeTool.ts) permet de **récupérer les informations d'urbanisme (PLU,POS,CC,PSMV)**
* [assiette_sup(lon,lat)](src/tools/AssietteSupTool.ts) permet de **récupérer les Servitude d'Utilité Publiques (SUP)**

### Recherche d'information générique

L'idée est ici de laisser le LLM exploiter les possibilités offertes par le LLM (**BLINDAGE EN COURS**) :

* [gpf_get_feature_types()](src/tools/GpfWfsGetTypesTool.ts) pour **lister les tables disponibles sur le WFS de la Géoplateforme** ([GetCapabilities](https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetCapabilities))

> Ex : "Quelles sont les données disponibles pour les communes?", "Quels sont les millésimes ADMINEXPRESS disponibles sur la Géoplateforme?"

* [gpf_wfs_describe_type(typename)](src/tools/GpfWfsDescribeTypeTool.ts) pour récupérer le **schéma d'une table** ([DescribeFeatureType](https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=DescribeFeatureType&typename=ADMINEXPRESS-COG.LATEST:commune&outputFormat=application/json))

> Ex : "Quelles sont les informations disponibles pour les communes avec ADMINEXPRESS-COG.LATEST?"

* [gpf_wfs_get_features(typename,...)](src/tools/GpfWfsGetFeaturesTool.ts) pour **récupérer les données d'une table** ([GetFeature](https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetFeature&typename=ADMINEXPRESS-COG.LATEST:commune&outputFormat=application/json&count=1))

> Ex : "Quelles sont les 5 communes les plus peuplées du Doubs (25) (source : ADMINEXPRESS-COG.LATEST:commune)?"



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

* [jsts](https://bjornharrtell.github.io/jsts/) pour les **traitements géométriques** (ex : tri des réponses par distance au point recherché).

## Licence

[MIT](LICENSE)

