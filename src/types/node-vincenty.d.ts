declare module "node-vincenty" {
  export interface VincentyDistanceResult {
    distance: number;
    initialBearing: number;
    finalBearing: number;
  }

  export function distVincenty(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
    callback?: (distance: number, initialBearing?: number, finalBearing?: number) => void,
  ): VincentyDistanceResult;
}
