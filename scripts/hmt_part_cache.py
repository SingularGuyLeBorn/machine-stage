"""按源网格及所有配合件的内容标识缓存加工结果，不按零件名跳过验证。"""
from pathlib import Path
import hashlib,json,shutil
import numpy as np

class PartCache:
 def __init__(self,root,pieces,mats,kernel):
  self.folder=Path(root)/'qa-out/hmt-part-cache';self.folder.mkdir(exist_ok=True)
  self.kernel=kernel;self.inputs=[]
  with open(Path(root)/'qa-out/hmt-mesh.bin','rb') as f:
   for p,mat in zip(pieces,mats):
    f.seek(p['offset']);h=hashlib.sha256(p['id'].encode()+np.asarray(mat,dtype='<f8').tobytes())
    h.update(f.read(p['vertices']*24+p['indices']*4));self.inputs.append(h.digest())
 def key(self,i,candidates,keys):
  h=hashlib.sha256(self.kernel+self.inputs[i])
  for j in candidates:h.update(bytes.fromhex(keys[j]))
  return h.hexdigest()
 def get(self,key,work,i):
  folder=self.folder/key;path=folder/'record.json'
  if not path.exists():return None
  record=json.loads(path.read_text(encoding='utf8'))
  if record['patch'] is not None:
   for kind in ('v','t'):shutil.copyfile(folder/f'{kind}.npy',Path(work)/f'{i}-{kind}.npy')
  return record
 def put(self,key,record,work,i):
  folder=self.folder/key
  if (folder/'record.json').exists():return
  folder.mkdir(exist_ok=True)
  if record['patch'] is not None:
   for kind in ('v','t'):shutil.copyfile(Path(work)/f'{i}-{kind}.npy',folder/f'{kind}.npy')
  temporary=folder/'record.tmp';temporary.write_text(json.dumps(record,separators=(',',':')),encoding='utf8');temporary.replace(folder/'record.json')
