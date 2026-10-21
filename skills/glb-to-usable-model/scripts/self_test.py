"""验证拓扑、切分、碰撞与 GLB 头解析；不是外观验收。运行 python self_test.py。"""
import json,struct,tempfile,unittest
from pathlib import Path
import numpy as np
import manifold3d as m
from mesh_audit import as_part,audit
from split_plane import split
from audit_motion import audit_motion
from inspect_glb import inspect

class GeometryTests(unittest.TestCase):
    def setUp(self):self.cube=as_part('cube',m.Manifold.cube((1,1,1)))
    def test_cube(self):
        r=audit(self.cube);self.assertEqual(r['issues'],[]);self.assertEqual(r['components'],1);self.assertAlmostEqual(r['signed_volumes'][0],1)
    def test_hole(self):
        self.cube['triangles'].pop();self.assertIn('boundary_edges',audit(self.cube)['issues'])
    def test_reverse(self):
        self.cube['triangles']=[t[::-1] for t in self.cube['triangles']]
        self.assertIn('negative_component_review_cavity_or_winding',audit(self.cube)['issues'])
    def test_duplicate(self):
        self.cube['triangles'].append(self.cube['triangles'][0]);self.assertIn('nonmanifold_edges',audit(self.cube)['issues'])
    def test_attribute_seams(self):
        p=np.asarray(self.cube['positions']);t=np.asarray(self.cube['triangles']);q={'name':'seams','positions':p[t].reshape(-1,3).tolist(),'triangles':np.arange(t.size).reshape(-1,3).tolist()}
        self.assertEqual(audit(q)['issues'],[])
    def test_split(self):
        parts,r=split(self.cube,[0,0,2],1)
        self.assertLess(r['overlap_volume'],1e-9);self.assertLess(r['symmetric_difference_volume'],1e-9)
        for p in parts:self.assertAlmostEqual(sum(audit(p)['signed_volumes']),.5)
    def test_missing_cut(self):
        with self.assertRaises(ValueError):split(self.cube,[0,0,1],10)
    def test_motion(self):
        b={**self.cube,'name':'b'};identity=np.eye(4);far=identity.copy();far[0,3]=2
        near=identity.copy();near[0,3]=.5
        frames=[{'time':0,'matrices':{'cube':identity.tolist(),'b':far.tolist()}}]
        self.assertTrue(audit_motion([self.cube,b],frames)['passed'])
        frames.append({'time':1,'matrices':{'cube':identity.tolist(),'b':near.tolist()}})
        report=audit_motion([self.cube,b],frames);self.assertFalse(report['passed']);self.assertAlmostEqual(report['pairs']['cube / b']['volume'],.5)
    def test_glb(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'test.glb';blob=json.dumps({'asset':{'version':'2.0'},'meshes':[]}).encode();blob+=b' '*((-len(blob))%4)
            p.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(blob))+struct.pack('<II',len(blob),0x4e4f534a)+blob)
            self.assertEqual(inspect(p)['meshes'],[])
            p.write_bytes(p.read_bytes()[:-1])
            with self.assertRaises(ValueError):inspect(p)

if __name__=='__main__':unittest.main()
