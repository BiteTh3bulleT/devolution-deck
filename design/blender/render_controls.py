"""Rebuild the Devolution hardware controls in a separate background Blender scene.
Usage: blender --background --factory-startup --python design/blender/render_controls.py
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src/assets/ui/v3'
OUT.mkdir(parents=True, exist_ok=True)
def material(name, color, metallic=0.0, roughness=.4, emission=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metallic; p.inputs['Roughness'].default_value=roughness
    if emission:
        p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    return m
metal=material('Graphite anodized metal',(.055,.066,.077),.78,.32)
rubber=material('Soft touch black rubber',(.017,.021,.025),.03,.7)
steel=material('Brushed titanium',(.23,.28,.32),.88,.3)
edge=material('Machined edge',(.1,.14,.17),.85,.24)
marker=material('Warm ivory index',(.88,.81,.64),.15,.32, .2)
amber=material('Amber status lamp',(.95,.27,.045),.12,.22,1.5)
cyan=material('Ice blue rim',(.06,.54,.62),.6,.28,.3)
def finish(obj, mat, bevel=.025):
    obj.data.materials.append(mat)
    if bevel:
        mod=obj.modifiers.new('Machined bevel','BEVEL');mod.width=bevel;mod.segments=3
        mod=obj.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    for p in obj.data.polygons:p.use_smooth=True
    return obj
def cylinder(name, radius, depth, z, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=radius,depth=depth,location=(0,0,z))
    o=bpy.context.object;o.name=name;return finish(o,mat)
def torus(name, radius, thickness, z, mat):
    bpy.ops.mesh.primitive_torus_add(major_segments=96,minor_segments=16,major_radius=radius,minor_radius=thickness,location=(0,0,z))
    o=bpy.context.object;o.name=name;return finish(o,mat,0)
def box(name, dimensions, position, mat, bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1,location=position)
    o=bpy.context.object;o.name=name;o.dimensions=dimensions
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,mat,bevel)
def setup(name, width=256, height=256, scale=2.6):
    scene=bpy.data.scenes.new(name);bpy.context.window.scene=scene
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
    scene.view_settings.view_transform='AgX'
    scene.world=bpy.data.worlds.new(name+' neutral studio');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.13,.15,.18,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
    cam=bpy.data.cameras.new(name+' orthographic camera');cam.type='ORTHO';cam.ortho_scale=scale
    obj=bpy.data.objects.new(name+' camera',cam);scene.collection.objects.link(obj)
    obj.location=(0,0,8);obj.rotation_euler=(0,0,0);scene.camera=obj
    for label,pos,power,size,color in [('key',(-3,4,6),450,5,(.93,.96,1)),('fill',(4,-2,4),160,4,(.65,.79,1)),('warm',(-4,-2,3),90,3,(1,.61,.34))]:
        light=bpy.data.lights.new(name+' '+label,'AREA');light.energy=power;light.shape='DISK';light.size=size;light.color=color
        obj=bpy.data.objects.new(name+' '+label,light);scene.collection.objects.link(obj);obj.location=pos
        obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
    return scene
scenes=[]
s=setup('knob-cap');scenes.append(s)
cylinder('Rubber knurled grip',.84,.35,.18,rubber)
for i in range(48):
    a=i*math.tau/48
    o=box('Grip ridge %02d'%i,(.035,.075,.2),(.82*math.sin(a),.82*math.cos(a),.2),metal,.012);o.rotation_euler.z=-a
cylinder('Anodized cap',.74,.12,.4,metal);torus('Cap bevel',.71,.027,.468,edge)
box('Index inlay',(.044,.23,.012),(0,.52,.472),marker,.014)
s=setup('knob-bezel');scenes.append(s)
torus('Recess surround',.98,.09,.06,rubber);torus('Titanium highlight',1.02,.02,.09,steel)
for i in range(31):
    a=math.radians(-135+i*9)
    o=box('Calibration %02d'%i,(.017,.07,.008),(1.18*math.sin(a),1.18*math.cos(a),.08),marker,.004);o.rotation_euler.z=-a
s=setup('jog-dial',512,512,2.8);scenes.append(s)
cylinder('Jog rubber base',1.22,.15,.08,rubber);torus('Machined outer ring',1.19,.035,.19,steel)
cylinder('Metal platter',1.12,.14,.18,metal)
for i,r in enumerate([.42,.48,.54,.6,.66,.72,.78,.84,.9,.96,1.02]):torus('Concentric machining %02d'%i,r,.006,.257,edge)
cylinder('Inner hub',.38,.025,.27,rubber);torus('Inner hub lip',.37,.012,.288,steel)
box('Platter index',(.024,.12,.018),(0,1.07,.27),marker,.007)
for i in range(64):
    a=i*math.tau/64
    cylinder('Strobe dimple %02d'%i,.012,.007,.272,steel)
    bpy.context.object.location.x=1.16*math.sin(a);bpy.context.object.location.y=1.16*math.cos(a)
for name,pressed in [('button-idle',False),('button-pressed',True)]:
    s=setup(name,256,96,3.0);scenes.append(s)
    box('Button recess',(2.85,.95,.12),(0,0,.06),rubber,.12)
    box('Aluminum shoulder',(2.71,.83,.15),(0,0,.12),edge,.1)
    box('Key cap',(2.57,.7,.15),(0,0,.19 if not pressed else .13),metal if not pressed else rubber,.09)
s=setup('button-amber',128,128,1.6);scenes.append(s)
cylinder('Lamp housing',.66,.17,.09,edge);cylinder('Silicone key',.56,.13,.2,rubber);torus('Amber LED halo',.52,.024,.274,amber)
s=setup('fader-cap',128,128,1.8);scenes.append(s)
box('Fader recess',(.88,1.42,.15),(0,0,.08),rubber,.06)
box('Fader metal handle',(.8,1.28,.18),(0,0,.21),steel,.06)
for y in [-.32,-.16,0,.16,.32]:box('Grip groove',(.62,.025,.018),(0,y,.306),rubber,.006)
box('Fader index',(.72,.035,.012),(0,0,.326),marker,.006)
# Save all editable scenes before rendering. No user scene is touched.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'design/blender/devolution-controls.blend'))
for scene in scenes:
    bpy.context.window.scene=scene;scene.render.filepath=str(OUT/(scene.name+'.png'))
    bpy.ops.render.render(write_still=True)
(OUT/'blender-manifest.json').write_text(json.dumps({'generator':'Blender','version':bpy.app.version_string,'source':'design/blender/devolution-controls.blend','script':'design/blender/render_controls.py','assets':[s.name+'.png' for s in scenes]},indent=2))
