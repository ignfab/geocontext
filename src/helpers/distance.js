import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import { DistanceOp } from 'jsts/org/locationtech/jts/operation/distance.js'

/**
 * Compute approximative distance in km between gA and gB.
 *
 * @param {object} gA GeoJSON Point
 * @param {object} gB GeoJSON Geometry
 */
export default function distance(gA, gB) {
    const geojsonReader = new GeoJSONReader()
    const a = geojsonReader.read(gA);
    const b = geojsonReader.read(gB);

    // converts to kilometers assuming earth is a sphere
    const distanceInDegree = DistanceOp.distance(a, b);
    return 6480.0 * ( distanceInDegree * 2.0 * Math.PI / 360.0 ) ;
}

