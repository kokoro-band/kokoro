"""Create the catalog GLBs and product previews in a dedicated Blender scene.

Blender 4.5 LTS:
  blender -b --factory-startup -P tools/blender/furniture.py -- --output /tmp/kokoro-models
Pass catalog IDs after the output path to rebuild individual pieces.
"""

import argparse
import json
import random
import sys
from math import cos, pi, sin
from pathlib import Path

import bpy
from mathutils import Vector


def rgba(color):
    channels = [int(color.strip("#")[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(
        c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels
    ) + (1,)


def mat(name, color, rough=0.72, metal=0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = rgba(color)
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = material.diffuse_color
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    return material


def mesh(name, verts, faces, material):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def bevel(obj, width, segments):
    mod = obj.modifiers.new("Rounded edges", "BEVEL")
    mod.width, mod.segments = width, segments
    mod.affect = "EDGES"
    normal = obj.modifiers.new("Surface normals", "WEIGHTED_NORMAL")
    normal.keep_sharp = True
    return obj


def box(name, xyz, size, material, radius=0.008, segments=2):
    points = [
        (x * size[0] / 2, y * size[1] / 2, z * size[2] / 2)
        for x, y, z in [
            (-1, -1, -1),
            (1, -1, -1),
            (1, 1, -1),
            (-1, 1, -1),
            (-1, -1, 1),
            (1, -1, 1),
            (1, 1, 1),
            (-1, 1, 1),
        ]
    ]
    obj = mesh(
        name,
        points,
        [
            (3, 2, 1, 0),
            (4, 5, 6, 7),
            (0, 1, 5, 4),
            (1, 2, 6, 5),
            (2, 3, 7, 6),
            (3, 0, 4, 7),
        ],
        material,
    )
    obj.location = xyz
    return bevel(obj, radius, segments) if radius else obj


def ring(name, center, profile, material, segments=28, caps=True):
    verts = [
        (
            center[0] + r * cos(2 * pi * i / segments),
            center[1] + r * sin(2 * pi * i / segments),
            center[2] + z,
        )
        for z, r in profile
        for i in range(segments)
    ]
    faces = [
        (
            row * segments + i,
            row * segments + (i + 1) % segments,
            (row + 1) * segments + (i + 1) % segments,
            (row + 1) * segments + i,
        )
        for row in range(len(profile) - 1)
        for i in range(segments)
    ]
    if caps:
        faces += [
            tuple(reversed(range(segments))),
            tuple(range((len(profile) - 1) * segments, len(profile) * segments)),
        ]
    obj = mesh(name, verts, faces, material)
    for face in list(obj.data.polygons)[: (len(profile) - 1) * segments]:
        face.use_smooth = True
    return obj


def rod(name, start, end, bottom, top, material, sides=9):
    delta = Vector(end) - Vector(start)
    obj = ring(
        name,
        (0, 0, 0),
        [(-delta.length / 2, bottom), (delta.length / 2, top)],
        material,
        sides,
    )
    obj.location = (Vector(start) + Vector(end)) / 2
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    return obj


def legs(material, x, y, height, thick, spread=1.15):
    for dx in (-x, x):
        for dy in (-y, y):
            rod(
                "Tapered leg",
                (dx * spread, dy * spread, 0),
                (dx, dy, height),
                thick * 0.58,
                thick,
                material,
            )


def sofa(item, modular):
    w, d = item["width"], item["depth"]
    fabric = mat("Moss wool" if modular else "Oat linen", item["color"], 0.92)
    base = mat(
        "Deep moss weave" if modular else "Oat seam",
        "#596650" if modular else "#A89784",
        0.9,
    )
    wood = mat(
        "Smoked ash" if modular else "Natural oak", "#654F3E" if modular else "#A47752"
    )
    legs(wood, w * 0.39, d * 0.31, 0.19, 0.036 if modular else 0.046, 1.02)
    box(
        "Upholstered platform",
        (0, 0, 0.235),
        (w - 0.055, d - 0.035, 0.24),
        base,
        0.061,
        3,
    )
    arm = 0.19 if modular else 0.245
    arm_height = 0.39 if modular else 0.46
    for side in (-1, 1):
        box(
            "Soft arm",
            (side * (w / 2 - arm / 2), -0.01, 0.43),
            (arm, d - 0.07, arm_height),
            fabric,
            0.079,
            3,
        )
    box(
        "Back frame",
        (0, d * 0.37, 0.55),
        (w - 2 * arm + 0.035, 0.21, 0.48),
        base,
        0.045,
        3,
    )
    count = 2 if modular else 3
    cushion = (w - 2 * arm - 0.025) / count
    for i in range(count):
        x = (i - (count - 1) / 2) * cushion
        box(
            "Seat cushion",
            (x, -0.10, 0.385),
            (cushion - 0.018, d * 0.61, 0.165),
            fabric,
            0.068,
            3,
        )
        back = box(
            "Back cushion",
            (x, d * 0.235, 0.61),
            (cushion - 0.014, 0.226, 0.36),
            fabric,
            0.085,
            3,
        )
        back.rotation_euler.x = -0.13 if modular else -0.17


def oak_table(item):
    wood = mat("Warm oak", item["color"], 0.55)
    end_grain = mat("Oak frame", "#9D7046")
    w, d = item["width"], item["depth"]
    box("Rounded oak slab", (0, 0, 0.415), (w, d, 0.09), wood, 0.035, 3)
    box("Inset apron", (0, 0, 0.334), (w * 0.84, d * 0.75, 0.10), end_grain, 0.012)
    legs(end_grain, w * 0.36, d * 0.32, 0.37, 0.041, 1.07)


def round_table(item):
    stone = mat("Ivory matte", item["color"], 0.58)
    pedestal = mat("Warm ivory pedestal", "#BEB5A4", 0.59)
    ring(
        "Round top",
        (0, 0, 0),
        [(0.443, 0.475), (0.455, 0.495), (0.47, 0.50), (0.504, 0.50), (0.52, 0.484)],
        stone,
        40,
    )
    ring(
        "Tapered pedestal",
        (0, 0, 0),
        [
            (0, 0.23),
            (0.009, 0.245),
            (0.041, 0.245),
            (0.061, 0.213),
            (0.112, 0.141),
            (0.391, 0.115),
            (0.45, 0.185),
        ],
        pedestal,
        28,
    )


def shell_chair(item):
    fabric = mat("Juniper shell", item["color"], 0.89)
    seat = mat("Juniper seat", "#587568", 0.93)
    wood = mat("Dark ash legs", "#694E3D", 0.66)
    profile = [
        (-0.32, 0.339, 0.238),
        (-0.24, 0.326, 0.281),
        (-0.12, 0.315, 0.31),
        (0.016, 0.32, 0.32),
        (0.129, 0.353, 0.321),
        (0.20, 0.414, 0.318),
        (0.25, 0.52, 0.307),
        (0.272, 0.646, 0.294),
        (0.276, 0.767, 0.257),
        (0.259, 0.785, 0.198),
    ]
    verts = [
        (x * w, y, z + (abs(x) ** 2) * 0.049)
        for y, z, w in profile
        for x in (-1, -0.78, -0.48, 0, 0.48, 0.78, 1)
    ]
    faces = [
        (r * 7 + i, r * 7 + i + 1, (r + 1) * 7 + i + 1, (r + 1) * 7 + i)
        for r in range(len(profile) - 1)
        for i in range(6)
    ]
    shell = mesh("Curved seat shell", verts, faces, fabric)
    for face in shell.data.polygons:
        face.use_smooth = True
    smooth = shell.modifiers.new("Continuous profile", "SUBSURF")
    smooth.levels = smooth.render_levels = 1
    shell.modifiers.new("Shell thickness", "SOLIDIFY").thickness = 0.034
    bevel(shell, 0.009, 2)
    cushion = box("Seat pad", (0, -0.085, 0.372), (0.45, 0.405, 0.095), seat, 0.036, 3)
    cushion.rotation_euler.x = 0.08
    legs(wood, 0.18, 0.135, 0.336, 0.034, 1.23)


def sand_chair(item):
    textile = mat("Sand woven fabric", item["color"], 0.9)
    wood = mat("Honey oak frame", "#956B43", 0.63)
    legs(wood, 0.216, 0.202, 0.47, 0.034, 1.15)
    box("Dining seat frame", (0, -0.031, 0.436), (0.59, 0.54, 0.075), wood, 0.018)
    box("Sand seat pad", (0, -0.052, 0.494), (0.57, 0.53, 0.082), textile, 0.034, 3)
    for side in (-1, 1):
        rod(
            "Back upright",
            (side * 0.24, 0.205, 0.38),
            (side * 0.229, 0.287, 0.85),
            0.035,
            0.025,
            wood,
            10,
        )
    sling = box(
        "Soft back panel", (0, 0.25, 0.74), (0.49, 0.108, 0.27), textile, 0.045, 3
    )
    sling.rotation_euler.x = -0.13


def olive(item):
    pot = mat("Warm stoneware", "#B39B7B", 0.82)
    dirt = mat("Potting soil", "#4D4032", 0.98)
    bark = mat("Olive bark", "#80654B", 0.86)
    leaves = [
        mat("Olive leaf", item["color"], 0.8),
        mat("Silver green leaf", "#859272", 0.75),
    ]
    ring(
        "Glazed pot",
        (0, 0, 0),
        [
            (0, 0.175),
            (0.014, 0.187),
            (0.346, 0.245),
            (0.37, 0.254),
            (0.393, 0.25),
            (0.39, 0.225),
            (0.349, 0.223),
        ],
        pot,
        32,
    )
    ring("Soil inset", (0, 0, 0), [(0.351, 0.221), (0.356, 0.223)], dirt, 24)
    rod("Trunk", (0, 0, 0.353), (0.022, 0.015, 1.04), 0.023, 0.011, bark, 10)
    rng = random.Random(291)
    batches = [[], []]
    branches = [
        (-0.23, 0.047, 0.85),
        (0.18, 0.135, 0.95),
        (0.22, -0.12, 0.89),
        (-0.16, -0.14, 1.075),
        (0.14, 0.09, 1.15),
        (-0.06, 0.09, 1.19),
    ]
    for index, tip in enumerate(branches):
        start = Vector((0.012, 0, 0.57 + index * 0.052))
        end = Vector(tip)
        rod("Olive branch", start, end, 0.011, 0.0038, bark, 8)
        for j in range(9):
            anchor = start.lerp(end, 0.26 + j * 0.081)
            heading = index * 2.33 + j * 2.4
            direction = Vector(
                (cos(heading), sin(heading), rng.uniform(-0.35, 0.68))
            ).normalized()
            blade = rng.uniform(0.07, 0.128)
            side = Vector((-direction.y, direction.x, 0.19)).normalized() * rng.uniform(
                0.014, 0.022
            )
            mid = anchor + direction * blade * 0.48
            batches[(index + j) % 2].extend(
                [
                    anchor,
                    mid + side,
                    anchor + direction * blade,
                    mid - side,
                    mid + Vector((0, 0, 0.009)),
                ]
            )
    for points, leaf_mat in zip(batches, leaves):
        faces = [(i, i + 1, i + 4) for i in range(0, len(points), 5)]
        faces += [(i + 1, i + 2, i + 4) for i in range(0, len(points), 5)]
        faces += [(i + 2, i + 3, i + 4) for i in range(0, len(points), 5)]
        faces += [(i + 3, i, i + 4) for i in range(0, len(points), 5)]
        mesh("Olive leaves", points, faces, leaf_mat)


def arc(item):
    frame = mat("Brushed bronze", "#756858", 0.48, 0.26)
    fabric = mat("Linen shade", item["color"], 0.88)
    inner = mat("Soft diffuser", "#F2DDAB", 0.79)
    shade = inner.node_tree.nodes.get("Principled BSDF")
    shade.inputs["Emission Color"].default_value = rgba("#FFDE9B")
    shade.inputs["Emission Strength"].default_value = 0.16
    ring(
        "Weighted base",
        (0, 0.13, 0),
        [(0, 0.135), (0.008, 0.150), (0.037, 0.150), (0.047, 0.13)],
        frame,
        32,
    )
    rod("Stem", (0, 0.13, 0.034), (0, 0.13, 1.25), 0.0115, 0.009, frame, 12)
    path = [
        (0, -0.152 + 0.282 * cos(i * pi / 2 / 22), 1.25 + 0.312 * sin(i * pi / 2 / 22))
        for i in range(23)
    ]
    path += [
        (0, -0.184, 1.559),
        (0, -0.212, 1.545),
        (0, -0.235, 1.516),
        (0, -0.244, 1.481),
    ]
    verts = []
    for i, point in enumerate(path):
        before = Vector(path[max(0, i - 1)])
        after = Vector(path[min(len(path) - 1, i + 1)])
        tangent = (after - before).normalized()
        for j in range(10):
            angle = j * 2 * pi / 10
            verts.append(
                Vector(point)
                + 0.0095
                * Vector((cos(angle), -tangent.z * sin(angle), tangent.y * sin(angle)))
            )
    faces = [
        (
            i * 10 + j,
            i * 10 + (j + 1) % 10,
            (i + 1) * 10 + (j + 1) % 10,
            (i + 1) * 10 + j,
        )
        for i in range(len(path) - 1)
        for j in range(10)
    ]
    tube = mesh("Continuous bronze arc", verts, faces, frame)
    for face in tube.data.polygons:
        face.use_smooth = True
    ring(
        "Soft tapered lampshade",
        (0, -0.244, 0),
        [
            (1.243, 0.154),
            (1.252, 0.16),
            (1.422, 0.107),
            (1.435, 0.102),
            (1.431, 0.094),
            (1.257, 0.15),
            (1.243, 0.154),
        ],
        fabric,
        32,
        False,
    )
    ring("Diffuser", (0, -0.244, 0), [(1.252, 0.147), (1.259, 0.148)], inner, 32)


def clear():
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def finish_model(item, height):
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = next(
        obj for obj in bpy.context.selected_objects if obj.type == "MESH"
    )
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    vertices = list(obj.data.vertices)
    low = [min(v.co[i] for v in vertices) for i in range(3)]
    high = [max(v.co[i] for v in vertices) for i in range(3)]
    target = (item["width"], item["depth"], height)
    origin = ((low[0] + high[0]) / 2, (low[1] + high[1]) / 2, low[2])
    for vert in vertices:
        for axis in range(3):
            vert.co[axis] = (
                (vert.co[axis] - origin[axis]) * target[axis] / (high[axis] - low[axis])
            )
    obj.data.update()
    obj.name = item["id"]
    bpy.ops.export_scene.gltf(
        filepath=str(output / f"{item['id']}.glb"),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_texcoords=False,
    )
    return obj


def aim(obj, target):
    obj.rotation_euler = (
        (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    )


def area(name, position, energy, size, color, target):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.size, data.color = energy, size, color
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = position
    aim(obj, target)


def render_thumb(item, height):
    extent = max(item["width"], item["depth"], height)
    focus = (0, 0, height * 0.5)
    camera = bpy.data.objects.new(
        "Product angle", bpy.data.cameras.new("Product angle")
    )
    scene.collection.objects.link(camera)
    camera.location = (extent * 2.3, -extent * 3.9, height * 0.5 + extent * 2.25)
    aim(camera, focus)
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = extent * 1.34
    scene.camera = camera
    area(
        "Key",
        (-extent * 1.8, -extent * 2, extent * 3.4),
        410 * extent**2,
        extent * 2.9,
        (1, 0.93, 0.85),
        focus,
    )
    area(
        "Fill",
        (extent * 2, extent * 1.8, extent * 2.4),
        205 * extent**2,
        extent * 2.6,
        (0.89, 0.95, 1),
        focus,
    )
    # A localized transparent shadow keeps the image edge clear on any card background.
    shadow = bpy.data.materials.new("Soft contact shadow")
    shadow.use_nodes = True
    nodes, links = shadow.node_tree.nodes, shadow.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    distance = nodes.new("ShaderNodeVectorMath")
    distance.operation = "DISTANCE"
    distance.inputs[1].default_value = (0.5, 0.5, 0)
    links.new(coords.outputs["UV"], distance.inputs[0])
    falloff = nodes.new("ShaderNodeValToRGB")
    falloff.color_ramp.interpolation = "EASE"
    falloff.color_ramp.elements[0].color = (0.24, 0.24, 0.24, 1)
    falloff.color_ramp.elements[1].position = 0.5
    falloff.color_ramp.elements[1].color = (0, 0, 0, 1)
    links.new(distance.outputs["Value"], falloff.inputs[0])
    blend = nodes.new("ShaderNodeMixShader")
    links.new(falloff.outputs["Color"], blend.inputs[0])
    links.new(nodes.new("ShaderNodeBsdfTransparent").outputs[0], blend.inputs[1])
    ink = nodes.new("ShaderNodeEmission")
    ink.inputs["Color"].default_value = rgba("#54463A")
    links.new(ink.outputs[0], blend.inputs[2])
    links.new(blend.outputs[0], nodes.get("Material Output").inputs["Surface"])
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, -0.003))
    ground = bpy.context.object
    ground.scale = (item["width"] * 1.25, item["depth"] * 1.24, 1)
    ground.data.materials.append(shadow)
    scene.render.filepath = str(output / "thumbnails" / f"{item['id']}.webp")
    bpy.ops.render.render(write_still=True)


def bed(item, daybed=False):
    w, d = item["width"], item["depth"]
    wood = mat("Ash frame", "#B79A77")
    linen = mat("Washed linen", item["color"], 0.94)
    pillow = mat("Ecru cotton", "#E8DECC", 0.97)
    accent = mat(
        "Ochre throw" if daybed else "Sage folded throw",
        "#AA7E5E" if daybed else "#838F7E",
        0.96,
    )
    legs(wood, w * 0.43, d * 0.38, 0.25, 0.044, 1.02)
    box("Rail", (0, 0, 0.25), (w, d, 0.16), wood, 0.038, 3)
    box("Mattress", (0, -0.015, 0.41), (w - 0.07, d - 0.09, 0.24), pillow, 0.095, 4)
    if daybed:
        box(
            "Upholstered seat",
            (0, -0.04, 0.51),
            (w - 0.12, d - 0.15, 0.15),
            linen,
            0.068,
            3,
        )
        box("Back rail", (0, d * 0.43, 0.52), (w - 0.04, 0.095, 0.39), wood, 0.026)
        for x in (-1, 1):
            box(
                "End rail",
                (x * (w / 2 - 0.045), 0, 0.49),
                (0.09, d, 0.34),
                wood,
                0.04,
                3,
            )
        for x, textile in [(-0.48, pillow), (0.05, accent), (0.5, linen)]:
            cushion = box(
                "Loose back pillow",
                (x, d * 0.27, 0.64),
                (0.48, 0.19, 0.36),
                textile,
                0.077,
                4,
            )
            cushion.rotation_euler.x = -0.19
    else:
        box("Padded headboard", (0, d * 0.46, 0.61), (w, 0.15, 0.74), linen, 0.068, 4)
        box("Duvet", (0, -d * 0.14, 0.535), (w - 0.05, d * 0.67, 0.13), linen, 0.06, 4)
        box(
            "Folded throw",
            (0, -d * 0.32, 0.60),
            (w - 0.06, 0.36, 0.066),
            accent,
            0.032,
            3,
        )
        for side in (-1, 1):
            cushion = box(
                "Sleeping pillow",
                (side * w * 0.226, d * 0.265, 0.56),
                (w * 0.41, d * 0.20, 0.16),
                pillow,
                0.075,
                4,
            )
            cushion.rotation_euler.z = side * 0.032


def cabinet_shell(w, d, h, wood):
    bottom, top = 0.171, h - 0.042
    for side in (-1, 1):
        box(
            "Side panel",
            (side * (w / 2 - 0.023), 0, (bottom + top) / 2),
            (0.046, d, top - bottom),
            wood,
            0.009,
        )
    for z in (0.15, h - 0.021):
        box("Carcass board", (0, 0, z), (w, d, 0.042), wood, 0.015)
    box(
        "Back panel",
        (0, d / 2 - 0.019, (bottom + top) / 2),
        (w - 0.093, 0.026, top - bottom),
        wood,
        0.004,
    )
    legs(wood, w * 0.43, d * 0.36, 0.15, 0.032, 1.035)


def storage(item, kind):
    w, d = item["width"], item["depth"]
    case = mat("Oiled timber", item["color"])
    trim = mat("Edge grain", "#9D7957")
    handle = mat("Brushed brass", "#907C59", 0.47, 0.45)
    h = {"reed": 0.82, "open": 1.62, "drawer": 0.88, "media": 0.48}[kind]
    cabinet_shell(w, d, h, case)
    if kind == "open":
        for z in (0.52, 0.89, 1.26):
            box(
                "Adjustable shelf", (0, 0, z), (w - 0.07, d - 0.015, 0.036), case, 0.007
            )
        book_colors = ["#777E69", "#B58C74", "#E2D5B9", "#888D8C"]
        for idx, (x, z, height) in enumerate(
            [
                (-0.32, 0.17, 0.24),
                (-0.25, 0.17, 0.27),
                (-0.18, 0.17, 0.21),
                (0.16, 0.54, 0.27),
                (0.23, 0.54, 0.22),
                (0.30, 0.54, 0.25),
            ]
        ):
            binding = mat("Clothbound book", book_colors[idx % 4])
            box(
                "Book jacket",
                (x, 0.025, z + height / 2),
                (0.052, 0.19, height),
                binding,
                0.004,
            )
    elif kind == "drawer":
        for row in range(3):
            z = 0.17 + (row + 0.5) * ((h - 0.21) / 3)
            box(
                "Drawer face",
                (0, -d / 2 + 0.015, z),
                (w - 0.08, 0.042, (h - 0.21) / 3 - 0.012),
                case,
                0.008,
            )
            for side in (-1, 1):
                rod(
                    "Pull",
                    (side * w * 0.27, -d / 2, z),
                    (side * w * 0.27, -d / 2 - 0.034, z),
                    0.019,
                    0.024,
                    trim,
                    12,
                )
    elif kind == "reed":
        for side in (-1, 1):
            box(
                "Door",
                (side * w * 0.237, -d / 2 + 0.018, 0.483),
                (w * 0.462, 0.04, 0.585),
                case,
                0.01,
            )
            for n in range(10):
                x = side * w * 0.237 + (n - 4.5) * w * 0.042
                box(
                    "Vertical timber reed",
                    (x, -d / 2 - 0.004, 0.482),
                    (0.025, 0.018, 0.56),
                    trim,
                    0.006,
                )
            box(
                "Brass pull",
                (side * 0.062, -d / 2 - 0.029, 0.50),
                (0.016, 0.032, 0.118),
                handle,
                0.006,
            )
    else:
        box("Shelf partition", (w * 0.075, 0, 0.306), (0.035, d - 0.03, 0.274), case)
        box(
            "Open component shelf",
            (-w * 0.2, 0, 0.31),
            (w * 0.54, d - 0.045, 0.025),
            case,
        )
        box(
            "Sliding door",
            (w * 0.282, -d * 0.45, 0.312),
            (w * 0.418, 0.031, 0.254),
            trim,
            0.008,
        )
        for n in range(12):
            box(
                "Door slat",
                (w * 0.095 + n * w * 0.034, -d * 0.49, 0.312),
                (0.024, 0.015, 0.226),
                case,
                0.004,
            )


def trestle(item):
    w, d = item["width"], item["depth"]
    wood = mat("Oak top", item["color"], 0.58)
    base = mat("End grain", "#936943")
    box("Dining surface", (0, 0, 0.713), (w, d, 0.055), wood, 0.024, 3)
    for side in (-1, 1):
        for end in (-1, 1):
            leg = box(
                "Splayed trestle",
                (side * w * 0.33, end * d * 0.245, 0.348),
                (0.115, 0.082, 0.7),
                base,
                0.016,
            )
            leg.rotation_euler.x = end * 0.18
        box(
            "Trestle foot",
            (side * w * 0.33, 0, 0.047),
            (0.133, d * 0.78, 0.083),
            base,
            0.018,
        )
    box("Cross rail", (0, 0, 0.29), (w * 0.68, 0.07, 0.092), base, 0.01)


def desk(item):
    w, d = item["width"], item["depth"]
    top = mat("Pale ash", item["color"])
    dark = mat("Graphite steel", "#575C58", 0.49, 0.35)
    box("Desk top", (0, 0, 0.722), (w, d, 0.055), top, 0.025, 3)
    for x in (-w * 0.428, w * 0.428):
        for y in (-d * 0.36, d * 0.36):
            box("Steel upright", (x, y, 0.35), (0.036, 0.036, 0.70), dark, 0.005)
        box("Floor runner", (x, 0, 0.024), (0.04, d * 0.76, 0.044), dark, 0.008)
    box(
        "Pencil drawer",
        (w * 0.25, 0.012, 0.626),
        (w * 0.37, d * 0.83, 0.133),
        top,
        0.013,
    )
    box(
        "Recessed pull", (w * 0.25, -d * 0.41, 0.624), (0.14, 0.017, 0.018), dark, 0.005
    )


def side_table(item):
    stone = mat("Honed travertine", item["color"], 0.78)
    oak = mat("Turned oak", "#AB8864")
    ring(
        "Stone top",
        (0, 0, 0),
        [(0.382, 0.218), (0.392, 0.236), (0.42, 0.24), (0.43, 0.228)],
        stone,
        36,
    )
    ring(
        "Pedestal",
        (0, 0, 0),
        [(0, 0.128), (0.022, 0.141), (0.37, 0.13), (0.386, 0.154)],
        oak,
        28,
    )
    for n in range(14):
        theta = 2 * pi * n / 14
        rod(
            "Fluting",
            (0.132 * cos(theta), 0.132 * sin(theta), 0.018),
            (0.122 * cos(theta), 0.122 * sin(theta), 0.367),
            0.013,
            0.012,
            oak,
            8,
        )


def bench(item):
    w, d = item["width"], item["depth"]
    cloth = mat("Forest upholstery", item["color"], 0.95)
    wood = mat("Waxed oak", "#AD845E")
    box("Bench rail", (0, 0, 0.348), (w - 0.045, d - 0.025, 0.075), wood, 0.021)
    box("Long seat pad", (0, 0, 0.407), (w, d, 0.104), cloth, 0.046, 4)
    legs(wood, w * 0.39, d * 0.30, 0.342, 0.041, 1.06)
    box("Lower stretcher", (0, 0, 0.144), (w * 0.79, 0.055, 0.063), wood, 0.01)


def stool(item):
    cork = mat("Natural cork", item["color"], 0.94)
    wood = mat("Beech", "#A68162")
    ring(
        "Cork seat",
        (0, 0, 0),
        [(0.47, 0.172), (0.482, 0.193), (0.517, 0.20), (0.545, 0.19), (0.55, 0.176)],
        cork,
        32,
    )
    feet = []
    for i in range(3):
        a = 2 * pi * i / 3 + pi / 2
        rod(
            "Splayed beech leg",
            (0.185 * cos(a), 0.185 * sin(a), 0.012),
            (0.106 * cos(a), 0.106 * sin(a), 0.49),
            0.023,
            0.032,
            wood,
            12,
        )
        feet.append((0.156 * cos(a), 0.156 * sin(a), 0.18))
    for i in range(3):
        rod("Footrest", feet[i], feet[(i + 1) % 3], 0.013, 0.013, wood)


def lounge(item):
    fabric = mat("Brick bouclé", item["color"], 0.94)
    walnut = mat("Waxed walnut", "#725342")
    for side in (-1, 1):
        for y in (-0.29, 0.28):
            rod(
                "Walnut post",
                (side * 0.342, y, 0),
                (side * 0.322, y, 0.605),
                0.032,
                0.039,
                walnut,
                12,
            )
        box(
            "Rounded armrest",
            (side * 0.347, 0, 0.61),
            (0.11, 0.77, 0.065),
            walnut,
            0.029,
            4,
        )
    box("Seat rail", (0, 0, 0.314), (0.72, 0.72, 0.107), walnut, 0.039, 3)
    box("Lounge cushion", (0, -0.077, 0.417), (0.656, 0.672, 0.169), fabric, 0.075, 4)
    back = box(
        "Deep padded back", (0, 0.253, 0.613), (0.688, 0.199, 0.444), fabric, 0.085, 4
    )
    back.rotation_euler.x = -0.20


builders = {
    "sofa-cloud": (lambda i: sofa(i, False), 0.86),
    "sofa-moss": (lambda i: sofa(i, True), 0.78),
    "table-oak": (oak_table, 0.46),
    "table-white": (round_table, 0.52),
    "chair-shell": (shell_chair, 0.80),
    "chair-sand": (sand_chair, 0.88),
    "plant-olive": (olive, 1.22),
    "lamp-arc": (arc, 1.68),
    "bed-linen": (bed, 0.98),
    "bed-day": (lambda i: bed(i, True), 0.78),
    "storage-reed": (lambda i: storage(i, "reed"), 0.82),
    "storage-open": (lambda i: storage(i, "open"), 1.62),
    "storage-drawer": (lambda i: storage(i, "drawer"), 0.88),
    "storage-media": (lambda i: storage(i, "media"), 0.48),
    "table-dining": (trestle, 0.74),
    "table-writing": (desk, 0.75),
    "table-side": (side_table, 0.43),
    "chair-bench": (bench, 0.46),
    "chair-stool": (stool, 0.55),
    "sofa-reading": (lounge, 0.85),
}


def generate(catalog, output_dir, ids):
    global output, scene
    output = Path(output_dir).resolve()
    (output / "thumbnails").mkdir(parents=True, exist_ok=True)
    items = {item["id"]: item for item in catalog}
    requested = ids or list(items)
    if set(requested) - (items.keys() & builders.keys()):
        raise ValueError("Unknown catalog item or missing builder")
    # An MCP call may share a Blender session with an open user project.
    # Keep existing datablocks, including unused ones the user has kept for later.
    resources = (bpy.data.meshes, bpy.data.cameras, bpy.data.lights, bpy.data.materials)
    existing = {block.as_pointer() for library in resources for block in library}
    previous = bpy.context.window.scene
    scene = bpy.data.scenes.new("Kokoro product photography")
    bpy.context.window.scene = scene
    world = bpy.data.worlds.new("Kokoro studio")
    try:
        scene.world = world
        scene.unit_settings.system = "METRIC"
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 16
        scene.cycles.use_denoising = True
        scene.cycles.max_bounces = 5
        scene.render.film_transparent = True
        scene.render.image_settings.file_format = "WEBP"
        scene.render.image_settings.color_mode = "RGBA"
        scene.render.image_settings.quality = 88
        scene.render.resolution_x = scene.render.resolution_y = 320
        scene.render.resolution_percentage = 100
        scene.view_settings.view_transform = "AgX"
        world.use_nodes = True
        world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.43
        for item_id in requested:
            item = items[item_id]
            build, height = builders[item_id]
            build(item)
            finish_model(item, height)
            render_thumb(item, height)
            clear()
    finally:
        clear()
        bpy.context.window.scene = previous
        bpy.data.scenes.remove(scene)
        bpy.data.worlds.remove(world)
        for library in resources:
            for block in list(library):
                if block.as_pointer() not in existing and block.users == 0:
                    library.remove(block)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("ids", nargs="*")
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )
    repo = Path(__file__).resolve().parents[2]
    catalog = json.loads((repo / "docs/contracts/furniture-catalog.json").read_text())[
        "items"
    ]
    generate(catalog, args.output, args.ids)
