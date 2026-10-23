# -*- coding: utf-8 -*-
"""微信文章 -> content.md + 本地图片 全流水线（HTML 已抓取到 html/NN.html）"""
import os, re, json, time, random, shutil, datetime, mimetypes
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup, NavigableString, Tag

BASE = os.path.dirname(os.path.abspath(__file__))
HTML_DIR = os.path.join(BASE, 'html')
URLS = [l.strip() for l in open(os.path.join(BASE, 'urls.txt'), encoding='utf-8') if l.strip()]

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
H = {'User-Agent': UA, 'Referer': 'https://mp.weixin.qq.com/'}
EXT = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
       'image/svg+xml': '.svg', 'image/bmp': '.bmp', 'image/x-icon': '.ico', 'image/tiff': '.tiff'}

def clean_name(s, maxlen=80):
    s = re.sub(r'[\\/:*?"<>|\r\n\t]', '', s or '').strip().strip('.')
    s = re.sub(r'\s+', ' ', s)
    return s[:maxlen].rstrip() or 'untitled'

def text_of(node):
    return node.get_text(strip=True) if node else ''

class ImgCollector:
    """convert 的同时收集图片 URL（按出现顺序去重）"""
    def __init__(self):
        self.urls = []
        self.videos = []
    def img(self, node):
        src = node.get('data-src') or node.get('src') or ''
        src = src.strip()
        if not src:
            return
        if src.startswith('//'):
            src = 'https:' + src
        if src not in self.urls:
            self.urls.append(src)
        idx = self.urls.index(src) + 1
        return f'![image](images/{idx:02d}.IMG)'  # .IMG 占位，下载后替换扩展名
    def video(self, node):
        src = node.get('data-src') or node.get('src') or ''
        src = src.strip()
        if not src:
            return None
        if src.startswith('//'):
            src = 'https:' + src
        if src not in self.videos:
            self.videos.append(src)
        idx = self.videos.index(src) + 1
        return f'<video src="videos/{idx:02d}.mp4"></video>'

def convert(node, out, col):
    if isinstance(node, NavigableString):
        if str(node).strip():
            out.append(str(node))
        return
    if not isinstance(node, Tag):
        return
    name = node.name.lower()
    if name in ('script', 'style'):
        return
    if name == 'iframe':
        cls = node.get('class') or []
        src = node.get('data-src') or node.get('src') or ''
        if 'video_iframe' in cls or 'mpvideo' in src or 'vid=' in src:
            t = col.video(node)
            if t:
                out.append('\n' + t + '\n')
        return
    if name in ('h1','h2','h3','h4','h5','h6'):
        out.append('\n' + '#' * (min(int(name[1]) + 1, 6)) + ' ' + node.get_text(' ', strip=True) + '\n')
        return
    if name in ('p', 'section', 'blockquote'):
        out.append('\n')
        for c in node.children:
            convert(c, out, col)
        out.append('\n')
        return
    if name in ('br', 'hr'):
        out.append('\n')
        return
    if name == 'img':
        t = col.img(node)
        if t:
            out.append(t + '\n')
        return
    if name == 'a':
        href = node.get('href') or ''
        if any(isinstance(c, Tag) and c.name == 'img' for c in node.children):
            for c in node.children:
                convert(c, out, col)
            return
        txt = node.get_text('', strip=False).strip()
        if txt:
            out.append(f'[{txt}]({href})' if href.startswith('http') else txt)
        return
    if name in ('ul', 'ol'):
        out.append('\n')
        for i, li in enumerate(node.find_all('li', recursive=False), 1):
            buf = []
            convert(li, buf, col)
            out.append(('-' if name == 'ul' else f'{i}.') + ' ' + re.sub(r'\s+', ' ', ''.join(buf)).strip() + '\n')
        out.append('\n')
        return
    if name in ('strong', 'b'):
        out.append('**' + node.get_text('', strip=False).strip() + '**')
        return
    if name in ('em', 'i'):
        out.append('*' + node.get_text('', strip=False).strip() + '*')
        return
    for c in node.children:
        convert(c, out, col)
    if name == 'div':
        out.append('\n')

def download(url, dest_base, tries=3):
    for t in range(tries):
        try:
            r = requests.get(url, headers=H, timeout=30, stream=True)
            if r.status_code != 200:
                raise RuntimeError(f'HTTP {r.status_code}')
            ct = (r.headers.get('Content-Type') or '').split(';')[0].strip().lower()
            ext = EXT.get(ct)
            if not ext:
                ext = os.path.splitext(urlparse(url).path)[1].lower()
                if ext not in ('.jpg','.jpeg','.png','.gif','.webp','.svg','.bmp','.ico'):
                    ext = '.jpg'
            if ext == '.jpeg':
                ext = '.jpg'
            data = r.content
            if len(data) < 100:
                raise RuntimeError(f'too small ({len(data)}B)')
            fn = dest_base + ext
            with open(fn, 'wb') as f:
                f.write(data)
            return fn, None
        except Exception as e:
            err = str(e)
            time.sleep(1.5 * (t + 1) + random.random())
    return None, err

def parse_one(i, url):
    f = os.path.join(HTML_DIR, f'{i:02d}.html')
    if not os.path.exists(f):
        return {'url': url, 'ok': False, 'reason': 'html missing'}
    raw = open(f, encoding='utf-8', errors='replace').read()
    if 'js_content' not in raw:
        return {'url': url, 'ok': False, 'reason': 'verify/unknown page'}
    soup = BeautifulSoup(raw, 'lxml')
    title = text_of(soup.select_one('#activity-name') or soup.select_one('h1')) or text_of(soup.title)
    if not title:
        og = soup.select_one('meta[property="og:title"]')
        title = og.get('content', '').strip() if og else ''
    gzh = text_of(soup.select_one('#js_name'))
    author = text_of(soup.select_one('#js_author_name'))
    pub = text_of(soup.select_one('#publish_time'))
    if not pub:
        m = re.search(r'var ct = "(\d+)"', raw)
        if m:
            pub = datetime.datetime.fromtimestamp(int(m.group(1))).strftime('%Y-%m-%d %H:%M:%S')
    content = soup.select_one('#js_content')
    col = ImgCollector()
    buf = []
    if content:
        convert(content, buf, col)
    md = re.sub(r'\n{3,}', '\n\n', ''.join(buf)).strip()

    folder = clean_name(title)
    dest = os.path.join(BASE, folder)
    if os.environ.get('REGEN'):
        # 重新生成模式：写入已存在的目录，已下载的图片跳过
        if not os.path.isdir(dest):
            return {'url': url, 'ok': False, 'reason': f'folder missing: {folder}'}
    else:
        n = 2
        while os.path.exists(dest):
            dest = os.path.join(BASE, f'{folder} ({n})')
            n += 1
        os.makedirs(dest)
    imgdir = os.path.join(dest, 'images')
    os.makedirs(imgdir, exist_ok=True)
    viddir = os.path.join(dest, 'videos')
    os.makedirs(viddir, exist_ok=True)

    fail_imgs = []
    for idx, u in enumerate(col.urls, 1):
        # 已存在（任何扩展名）则跳过下载，只修正引用
        exist = [x for x in os.listdir(imgdir) if re.match(rf'^{idx:02d}\.', x)]
        if exist:
            md = md.replace(f'![image](images/{idx:02d}.IMG)', f'![image](images/{exist[0]})')
            continue
        fn, err = download(u, os.path.join(imgdir, f'{idx:02d}'))
        if fn is None:
            fail_imgs.append({'url': u, 'reason': err})
            md = md.replace(f'![image](images/{idx:02d}.IMG)', f'![image](images/{idx:02d}.jpg)')
        else:
            md = md.replace(f'![image](images/{idx:02d}.IMG)',
                            f'![image](images/{os.path.basename(fn)})')
    md = re.sub(r'!\[image\]\(images/(\d+)\.IMG\)', r'![image](images/\1.jpg)', md)

    fail_vids = []
    for idx, u in enumerate(col.videos, 1):
        exist = [x for x in os.listdir(viddir) if re.match(rf'^{idx:02d}\.', x)]
        if exist:
            md = md.replace(f'<video src="videos/{idx:02d}.mp4"></video>',
                            f'<video src="videos/{exist[0]}"></video>')
            continue
        fn, err = download_video(u, raw, os.path.join(viddir, f'{idx:02d}'))
        if fn is None:
            fail_vids.append({'iframe': u, 'reason': err})
        else:
            md = md.replace(f'<video src="videos/{idx:02d}.mp4"></video>',
                            f'<video src="videos/{os.path.basename(fn)}"></video>')

    header = [f'# {title}', '']
    if author:
        header.append(f'- 作者: {author}')
    header.append(f'- 公众号: {gzh}')
    if pub:
        header.append(f'- 发布时间: {pub}')
    header.append(f'- 原文: {url}')
    header.append('')
    open(os.path.join(dest, 'content.md'), 'w', encoding='utf-8').write('\n'.join(header) + '\n\n' + md + '\n')

    rec = {'url': url, 'ok': True, 'title': title, 'folder': os.path.basename(dest),
           'gzh': gzh, 'pub': pub, 'images': len(col.urls),
           'images_failed': len(fail_imgs), 'image_failures': fail_imgs,
           'videos': len(col.videos), 'videos_failed': len(fail_vids),
           'video_failures': fail_vids}
    return rec

def find_video_mp4(raw, iframe_url):
    """从文章 HTML 的 videoPageInfos 里按 vid 找签名 mp4 地址，取最高清晰度"""
    m = re.search(r'[?&]vid=(wxv_\w+)', iframe_url)
    if not m:
        return None
    vid = m.group(1)
    i = raw.find(f"video_id: '{vid}'")
    if i < 0:
        return None
    j = raw.find('video_id:', i + 10)
    block = raw[i:j if j > 0 else len(raw)]
    best = None
    for fm in re.finditer(r"format_id: '(\d+)'.*?url: '(https?://[^']+?\.mp4[^']*)'", block, re.S):
        fid, url = int(fm.group(1)), fm.group(2)
        url = url.replace('\\x26amp;', '&').replace('\\x26', '&').replace('amp;', '&')
        if best is None or fid > best[0]:
            best = (fid, url)
    return best[1] if best else None

def download_video(iframe_url, raw, dest_base, tries=3):
    """从文章 HTML 提取签名 mp4 并下载。返回 (文件路径, 错误)"""
    err = 'no mp4 url found in article html'
    real = find_video_mp4(raw, iframe_url)
    if not real:
        return None, err
    for t in range(tries):
        try:
            rv = requests.get(real, headers=H, timeout=120, stream=True)
            if rv.status_code != 200:
                raise RuntimeError(f'mp4 HTTP {rv.status_code}')
            fn = dest_base + '.mp4'
            with open(fn, 'wb') as fh:
                for chunk in rv.iter_content(1 << 20):
                    fh.write(chunk)
            if os.path.getsize(fn) < 10000:
                os.remove(fn)
                raise RuntimeError('mp4 too small')
            return fn, None
        except Exception as e:
            err = str(e)
            time.sleep(2 * (t + 1) + random.random())
    return None, err

ONLY = os.environ.get('ONLY')
REGEN = os.environ.get('REGEN')

# 清掉旧的输出（保留 html/ urls.txt pipeline.py）；单篇/重生成模式不清空
if not ONLY and not REGEN:
    for name in os.listdir(BASE):
        p = os.path.join(BASE, name)
        if os.path.isdir(p) and name != 'html':
            shutil.rmtree(p)

results = []
for i, url in enumerate(URLS, 1):
    if ONLY and str(i) != ONLY:
        continue
    rec = parse_one(i, url)
    results.append(rec)
    print(i, 'OK' if rec['ok'] else 'FAIL', rec.get('title') or rec.get('reason'),
          f"imgs={rec.get('images')} fail={rec.get('images_failed')} "
          f"vids={rec.get('videos')} vfail={rec.get('videos_failed')}", flush=True)
    time.sleep(random.uniform(0.3, 0.8))

ok = [r for r in results if r['ok']]
fail = [r for r in results if not r['ok']]
print(f'\nTOTAL OK={len(ok)} FAIL={len(fail)}')
img_fail = sum(r.get('images_failed', 0) for r in ok)
print(f'image failures total: {img_fail}')
rp = os.path.join(BASE, 'report.json')
if ONLY and os.path.exists(rp):
    old = json.load(open(rp, encoding='utf-8'))
    old = [r for r in old if r['url'] not in {x['url'] for x in results}]
    results = old + results
json.dump(results, open(rp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
