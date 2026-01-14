import { WAYPOINTS } from "../data/Constants";
export class DangerPoints {
    constructor(towers) {
        this.points = [];
        this.towers = towers;
        //Calculating all danger points at initialization
        for(let p of WAYPOINTS){
            this.addDangerPoint(WAYPOINTS.indexOf(p), 
            (this.getDangerPointsForWaypoint(WAYPOINTS.indexOf(p))).fireDanger, 
            (this.getDangerPointsForWaypoint(WAYPOINTS.indexOf(p))).iceDanger
            );
        }
    }
    addDangerPoint(waypointId, dangerFire = 0, dangerIce = 0) {
        this.points.push({ waypointId, dangerFire, dangerIce });
    }

    getDangerPointsForWaypoint(waypointId) {
        let x = WAYPOINTS[waypointId]?.x || 0;
        let z = WAYPOINTS[waypointId]?.z || 0;
        let iceDanger = 0;
        let fireDanger = 0;
        for(let tower of this.towers){
            let tx = Math.floor(tower.mesh.position.x / 5);
            let tz = Math.floor(tower.mesh.position.z / 5);
            if(Math.sqrt((tx - x)*(tx - x) + (tz - z)*(tz - z)) <= 2){ //within 2 tiles
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
        for(let p of WAYPOINTS){
            this.addDangerPoint(WAYPOINTS.indexOf(p), 
            (this.getDangerPointsForWaypoint(WAYPOINTS.indexOf(p))).fireDanger, 
            (this.getDangerPointsForWaypoint(WAYPOINTS.indexOf(p))).iceDanger
            );
        }
        console.log("Calculated Danger Points: ", this.points);
    }

    clearAll() {
        this.points = [];
    }
}

export default DangerPoints;
