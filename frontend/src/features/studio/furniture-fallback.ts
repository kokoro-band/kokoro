import * as THREE from "three"

import type { CatalogItem, Furniture } from "./types"

export function addBox(
  group: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  color: string
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  )
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

export function makeFallbackModel(item: Furniture, catalogItem?: CatalogItem) {
  const group = new THREE.Group()
  const width = catalogItem?.width ?? 0.6
  const depth = catalogItem?.depth ?? 0.6

  if (item.category === "소파") {
    addBox(group, [width, 0.35, depth], [0, 0.38, 0], item.color)
    addBox(group, [width, 0.5, 0.18], [0, 0.73, depth / 2 - 0.08], item.color)
    addBox(group, [0.15, 0.5, depth], [-width / 2 + 0.07, 0.6, 0], item.color)
    addBox(group, [0.15, 0.5, depth], [width / 2 - 0.07, 0.6, 0], item.color)
    for (const x of [-width / 2 + 0.15, width / 2 - 0.15]) {
      for (const z of [-depth / 2 + 0.12, depth / 2 - 0.12])
        addBox(group, [0.06, 0.22, 0.06], [x, 0.11, z], "#55463B")
    }
  } else if (item.category === "테이블") {
    if (item.catalogId === "table-white") {
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(width / 2, width / 2, 0.08, 40),
        new THREE.MeshStandardMaterial({ color: item.color })
      )
      top.position.y = 0.6
      top.castShadow = true
      group.add(top)
      addBox(group, [0.15, 0.55, 0.15], [0, 0.28, 0], "#C3B9AC")
    } else {
      addBox(group, [width, 0.08, depth], [0, 0.48, 0], item.color)
      for (const x of [-width / 2 + 0.12, width / 2 - 0.12]) {
        for (const z of [-depth / 2 + 0.1, depth / 2 - 0.1])
          addBox(group, [0.06, 0.46, 0.06], [x, 0.23, z], "#8D633E")
      }
    }
  } else if (item.category === "의자") {
    addBox(group, [width, 0.12, depth], [0, 0.48, 0], item.color)
    addBox(group, [width, 0.55, 0.12], [0, 0.78, depth / 2 - 0.06], item.color)
    for (const x of [-0.24, 0.24]) {
      for (const z of [-0.23, 0.23])
        addBox(group, [0.045, 0.45, 0.045], [x, 0.23, z], "#53493E")
    }
  } else if (item.catalogId === "lamp-arc") {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.05, 24),
      new THREE.MeshStandardMaterial({ color: "#57534D" })
    )
    base.position.y = 0.03
    group.add(base)
    addBox(group, [0.035, 1.45, 0.035], [0, 0.74, 0], "#57534D")
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.3, 32, 1, true),
      new THREE.MeshStandardMaterial({
        color: item.color,
        side: THREE.DoubleSide,
      })
    )
    shade.position.y = 1.48
    group.add(shade)
  } else {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.15, 0.35, 24),
      new THREE.MeshStandardMaterial({ color: "#C1AD94" })
    )
    pot.position.y = 0.18
    pot.castShadow = true
    group.add(pot)
    addBox(group, [0.04, 0.75, 0.04], [0, 0.65, 0], "#756348")
    for (const [x, y, z, radius] of [
      [0, 1.05, 0, 0.3],
      [-0.18, 0.8, 0.08, 0.23],
      [0.18, 0.85, -0.08, 0.23],
    ]) {
      const leaves = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 12),
        new THREE.MeshStandardMaterial({ color: item.color, roughness: 1 })
      )
      leaves.position.set(x, y, z)
      leaves.scale.y = 1.25
      leaves.castShadow = true
      group.add(leaves)
    }
  }

  // Width/depth define the footprint even when a decorative mesh is wider.
  const size = new THREE.Box3()
    .setFromObject(group)
    .getSize(new THREE.Vector3())
  group.scale.set(width / size.x, 1, depth / size.z)
  return group
}
