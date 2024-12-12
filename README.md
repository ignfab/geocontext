# geocontext

An **experimental** API providing spatial context for LLM.

## Motivation

REST/GeoJSON API can be invoked by LLMs for RAG purpose. Meanwhile, trying to integrate the use [apicarto.ign.fr](https://apicarto.ign.fr) from IGNF in ChatGPT leads to consider the following points (see [apicarto - issue #109 (french)](https://github.com/IGNF/apicarto/issues/109)) :

* Some **input params** are not relevant (too many options, GeoJSON input geom instead vs lon,lat,...)
* Some **default values** are not adapted (there is no reason to define defaults limits to 5000 features)
* **Large GeoJSON polygons** in API responses are **not relevant** and leads to **ResponseTooLargeError** with ChatGPT.
* There is **no need to produce GeoJSON Feature** with id, properties and a geometry put on a pedestal.
* ...

This is an attempt to create a "facade" over existing spatial services to ease usage with LLM.

## Principles

* Use existing service for geocoding.
  * Import [docs/gpf-autocompletion.yaml](docs/gpf-autocompletion.yaml) adapted from [geoservices.ign.fr - Service Géoplateforme d’autocomplétion](https://geoservices.ign.fr/documentation/services/services-geoplateforme/autocompletion)
* No large geometries in responses.
* JSON responses as flat as possible (no GeoJSON Feature or FeatureCollection)
* Integration of [geoservices](https://geoservices.ign.fr/services-web) from [Géoplateforme](https://www.ign.fr/geoplateforme) first.

## Features

See [OpenAPI specifications](public/geocontext.yaml).

## Credits

* [express](https://expressjs.com/en/starter/hello-world.html)
* [express-validator](https://express-validator.github.io/docs/guides/getting-started)

## License

[MIT](LICENSE)

