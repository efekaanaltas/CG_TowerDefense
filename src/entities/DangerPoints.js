import { WAYPOINTS } from "../data/Constants";
export class DangerPoints {
    constructor(towers) {
        this.points = [];
        this.towers = towers;
        //Calculating all danger points at initialization
        for (let i = 0; i < WAYPOINTS.length; i++) {
            this.addDangerPoint(i, 
            this.getDangerPointsForWaypoint(i).fireDanger, 
            this.getDangerPointsForWaypoint(i).iceDanger
        );
        }
    }

    addDangerPoint(waypointIdx, dangerFire = 0, dangerIce = 0) {
        this.points.push({ waypointIdx, dangerFire, dangerIce });
    }

    getDangerPointsForWaypoint(waypointIdx) {
        var x = WAYPOINTS[waypointIdx]?.x || 0;
        var z = WAYPOINTS[waypointIdx]?.z || 0;
        var iceDanger = 0;
        var fireDanger = 0;
        for(let tower of this.towers){
            var tx = Math.floor(tower.mesh.position.x / 2);
            var tz = Math.floor(tower.mesh.position.z / 2);
            let dist = Math.sqrt((tx - x)*(tx - x) + (tz - z)*(tz - z));
            console.log(`Tower at (${tx}, ${tz}) to Waypoint (${x}, ${z}) distance: ${dist}`);
            if(dist <= 3){ 
            //within 3 tiles
                if(tower.stats.element === 'fire'){
                    fireDanger += 1;
                }
                else if(tower.stats.element === 'ice'){
                    iceDanger += 1;
                }   
            }   
        }
        return { iceDanger, fireDanger };
    }

    calculateAllDangerPoints() {
        this.clearAll();
        for (let i = 0; i < WAYPOINTS.length; i++) {
            this.addDangerPoint(i, 
            this.getDangerPointsForWaypoint(i).fireDanger, 
            this.getDangerPointsForWaypoint(i).iceDanger
        );
    }
        console.log("Calculated Danger Points: ", this.points);
    }

    clearAll() {
        this.points = [];
    }
}

export default DangerPoints;
