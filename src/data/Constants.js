export const TILE_SIZE = 2;

export const TOWER_TYPES = [
    { name: "Turret", modelKey: 'tower_turret', modelScale: 7, cost: 50, color: 0xFFFF00, range: 8, fireRate: 800, damage: 30, element: "physical", shotCount: 1, spread: 0 },
    { name: "Shotgun", modelKey: 'tower_shotgun', modelScale: 7, cost: 120, color: 0xFFA500, range: 6, fireRate: 1200, damage: 20, element: "physical", shotCount: 3, spread: 0.3 },
    { name: "Pyro", modelKey: 'tower_pyro', modelScale: 7, cost: 200, color: 0xFF0000, range: 7, fireRate: 200, damage: 5, element: "fire", shotCount: 1, spread: 0 },
    { name: "Cryo", modelKey: 'tower_cryo', modelScale: 7, cost: 150, color: 0x00FFFF, range: 10, fireRate: 1500, damage: 80, element: "ice", shotCount: 1, spread: 0 }
];

export const ENEMY_TYPES = [
    { type: "normal", color: 0x888888, hp: 100, weakness: "none" },
    { type: "ice_golem", color: 0x00FFFF, hp: 150, weakness: "fire" },
    { type: "fire_imp", color: 0xFF4400, hp: 80, weakness: "ice" }
];

export const WAVE_DATA = [
    { 
        enemies: { normal: 5, ice_golem: 0, fire_imp: 0 }, 
        spawnDelay: 1200
    },
    { 
        enemies: { normal: 8, ice_golem: 3, fire_imp: 0 }, 
        spawnDelay: 1000 
    },
    { 
        enemies: { normal: 10, ice_golem: 5, fire_imp: 1 }, 
        spawnDelay: 900 
    },
    { 
        enemies: { normal: 5, ice_golem: 10, fire_imp: 2 }, 
        spawnDelay: 800 
    },
    { 
        enemies: { normal: 15, ice_golem: 15, fire_imp: 5 }, 
        spawnDelay: 700 
    }
];

// Map: 0=Path, 1=Buildable, 2=Goal
export const MAP_LAYOUT = [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 2],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ];

export const WAYPOINTS = [
    { x: 0, z: 1 }, { x: 4, z: 1 }, { x: 4, z: 3 }, { x: 10, z: 3 },
    { x: 10, z: 6 }, { x: 6, z: 6 }, { x: 6, z: 8 }, { x: 13, z: 8 },
    { x: 13, z: 10 }, { x: 19, z: 10 }
];

export const MODEL_PATHS = {
    'car': '/assets/Car.glb',
    'sword': '/assets/Sword.glb',
    'plant': '/assets/Plant.glb',
    'tower_turret': '/assets/Turret.glb',
    'tower_shotgun': '/assets/Shotgun.glb',
    'tower_pyro': '/assets/Pyro.glb',
    'tower_cryo': '/assets/Cryo.glb'
};

export const INTERACTABLE_TYPES = [
    { type: 'Car', modelKey: 'car', scale: 0.6 },
    { type: 'Sword', modelKey: 'sword', scale: 2.5 },
    { type: 'Plant', modelKey: 'plant', scale: 5 }
];
