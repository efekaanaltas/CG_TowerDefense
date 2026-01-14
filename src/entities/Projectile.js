import * as THREE from 'three';

export class Projectile {
    constructor(scene, startPos, direction, stats) {
        this.scene = scene;
        this.direction = direction;
        this.stats = stats;
        this.startPos = startPos.clone();
        this.speed = 0.2;
        this.shouldRemove = false;

        this.mesh = this.createMesh(stats.color);
        this.mesh.position.copy(startPos);
        
        scene.add(this.mesh);
    }

    createMesh(color) {
        const geometry = new THREE.SphereGeometry(0.2, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: color });
        return new THREE.Mesh(geometry, material);
    }

    update(enemies) {
        this.mesh.position.addScaledVector(this.direction, this.speed);

        if (this.mesh.position.distanceTo(this.startPos) > this.stats.range) {
            this.shouldRemove = true;
            return;
        }

        for (const enemy of enemies) {
            if (this.mesh.position.distanceTo(enemy.mesh.position) < 1.0) {
                enemy.takeDamage(this.stats.damage, this.stats.element);
                this.shouldRemove = true;
                return;
            }
        }
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}