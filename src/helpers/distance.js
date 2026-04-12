import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import { DistanceOp } from 'jsts/org/locationtech/jts/operation/distance.js'

import turfDistance from '@turf/distance'
import {point as turfPoint} from '@turf/helpers'

/**
 * Compute approximative distance in meters between gA and gB.
 *
 * @param {object} gA GeoJSON Point
 * @param {object} gB GeoJSON Geometry
 */
export default function distance(gA, gB) {
    const geojsonReader = new GeoJSONReader()
    const a = geojsonReader.read(gA);
    const b = geojsonReader.read(gB);

    /*
     * Get the 2 nearest points between a and b
     *
     * Note that it will project according to longitude and latitude axis,
     * so it is not really accurate, but it is a good approximation
     */
    const nearestPoints = DistanceOp.nearestPoints(a, b);
    if ( nearestPoints.length !== 2 ) {
        throw new Error('DistanceOp.nearestPoints should return 2 points');
    }

    /*
     * harversine distance between the 2 nearest points (see https://turfjs.org/docs/api/distance)
     */
    return turfDistance(
        turfPoint([nearestPoints[0].x, nearestPoints[0].y]), 
        turfPoint([nearestPoints[1].x, nearestPoints[1].y]), 
        { units: 'meters' }
    );
}

