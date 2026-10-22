"""只读盘点 GLB 2.0；不把 accessor 元数据误当实际网格审计。"""
import argparse, hashlib, json, struct
from pathlib import Path

def inspect(path):
    raw=Path(path).read_bytes()
    if len(raw)<12: raise ValueError('GLB 头不足 12 字节')
    magic,version,length=struct.unpack_from('<4sII',raw)
    if magic!=b'glTF' or version!=2 or length!=len(raw): raise ValueError('需要长度正确的 GLB 2.0')
    chunks=[]; offset=12; document=None
    while offset<len(raw):
        if offset+8>len(raw): raise ValueError('chunk 头截断')
        size,kind=struct.unpack_from('<II',raw,offset);offset+=8
        if size%4 or offset+size>len(raw): raise ValueError('chunk 长度/对齐错误')
        chunk=raw[offset:offset+size];offset+=size;chunks.append({'type':hex(kind),'bytes':size})
        if kind==0x4e4f534a:
            if document is not None: raise ValueError('重复 JSON chunk')
            document=json.loads(chunk)
    if document is None: raise ValueError('缺少 JSON chunk')
    d=document
    return {'path':str(Path(path).resolve()),'sha256':hashlib.sha256(raw).hexdigest(),
        'bytes':len(raw),'chunks':chunks,'default_scene':d.get('scene'),
        'scenes':d.get('scenes',[]),'extensions_required':d.get('extensionsRequired',[]),
        'nodes':d.get('nodes',[]),'skins':d.get('skins',[]),
        'meshes':d.get('meshes',[]),'accessors':d.get('accessors',[]),
        'materials':d.get('materials',[]),'images':d.get('images',[]),
        'textures':d.get('textures',[]),'buffers':d.get('buffers',[]),
        'animations':[{'name':a.get('name'),'channels':a.get('channels',[]),'samplers':a.get('samplers',[])} for a in d.get('animations',[])],
        'note':'accessor min/max 是源文件声明；世界坐标、蒙皮姿态、闭合性仍须导入并实测。外部 URI 只列出，不自动访问。'}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input');p.add_argument('--out',required=True)
    p.add_argument('--overwrite',action='store_true');a=p.parse_args();out=Path(a.out)
    if out.exists() and not a.overwrite:p.error('输出已存在；另选路径或显式 --overwrite')
    result=inspect(a.input);out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f"{len(result['meshes'])} meshes, {len(result['nodes'])} nodes, {len(result['images'])} images → {out}")
