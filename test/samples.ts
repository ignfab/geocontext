import { LineString, Point } from "geojson";

export const paris: Point = { "type": "Point", "coordinates": [2.333333, 48.866667] };
export const marseille: Point = { "type": "Point", "coordinates": [5.400000, 43.300000] };
export const besancon: Point = { "type": "Point", "coordinates": [6.0240539, 47.237829] };

export const mairieLoray: Point = { "type": "Point", "coordinates": [6.497148, 47.153263] };

export const parisMarseille: LineString = {
    "type": "LineString", "coordinates": [
        paris.coordinates,
        marseille.coordinates
    ]
};
