"""Capture dependency license files after go mod download and npm ci.

The generated files are committed and shipped, so consumers need no network.
"""
import json
import re
import shutil
import subprocess
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
LICENSES=ROOT/'licenses'

def main():
    LICENSES.mkdir(exist_ok=True)
    shutil.copy2(ROOT/'frontend/public/fonts/LICENSE.txt',LICENSES/'font-Noto-CJK.txt')
    source=subprocess.check_output(['go','list','-m','-json','all'],cwd=ROOT,text=True)
    decoder=json.JSONDecoder();modules=[]
    while source.strip():
        obj,offset=decoder.raw_decode(source.lstrip());source=source.lstrip()[offset:];modules.append(obj)
    records=[]
    for name in ['ChiUns-source.conf','WEBP-source.html','KJV-source.conf']:
        shutil.copy2(ROOT/'data'/name,LICENSES/('scripture-'+name))
    for module in modules:
        if module.get('Main') or not module.get('Dir'):continue
        files=[p for p in Path(module['Dir']).iterdir() if p.is_file() and re.match(r'(?i)^(license|copying|copyright|notice)(\.|$|-)',p.name)]
        if not files:raise RuntimeError('Missing license text: '+module['Path'])
        for path in files:
            dest=LICENSES/('go-'+re.sub(r'[^a-zA-Z0-9_.-]','_',module['Path'])+'-'+path.name)
            shutil.copyfile(path,dest)
        records.append({'type':'go','name':module['Path'],'version':module['Version'],'licenses':[p.name for p in files]})
    lock=json.loads((ROOT/'frontend/package-lock.json').read_text(encoding='utf-8'))
    for folder,package in lock['packages'].items():
        if not folder or package.get('dev'):continue
        directory=ROOT/'frontend'/folder
        files=[p for p in directory.iterdir() if p.is_file() and re.match(r'(?i)^(license|copying|copyright|notice)(\.|$|-)',p.name)]
        if not files:
            name=folder.removeprefix('node_modules/')
            readme=directory/'README.md'
            if readme.is_file() and 'Permission is hereby granted' in readme.read_text(encoding='utf-8'):
                original=readme.read_text(encoding='utf-8')
                dest=LICENSES/('npm-'+re.sub(r'[^a-zA-Z0-9_.-]','_',name)+'-LICENSE')
                dest.write_text(original[original.rfind('## License'):],encoding='utf-8')
                records.append({'type':'npm','name':name,'version':package['version'],'source':'Published README.md license section','licenses':[dest.name]})
                continue
            upstream={
                '@ant-design/icons-svg':'https://raw.githubusercontent.com/ant-design/ant-design-icons/7f2516ac91226d2b41f93b35cb5197c8d94f7189/LICENSE',
                '@wailsio/runtime':'https://raw.githubusercontent.com/wailsapp/wails/v3.1.0/LICENSE',
                'is-mobile':'https://raw.githubusercontent.com/juliangruber/is-mobile/2708dd8f07d91f354a46b8dff3053abb6b840067/LICENSE'}
            name=folder.removeprefix('node_modules/');url=upstream.get(name)
            if not url:raise RuntimeError('Missing license text: '+folder)
            dest=LICENSES/('npm-'+re.sub(r'[^a-zA-Z0-9_.-]','_',name)+'-LICENSE')
            if not dest.is_file():
                with urllib.request.urlopen(url,timeout=30) as response:dest.write_bytes(response.read())
            records.append({'type':'npm','name':name,'version':package['version'],'source':url,'licenses':[dest.name]})
            continue
        for path in files:
            dest=LICENSES/('npm-'+re.sub(r'[^a-zA-Z0-9_.-]','_',folder.removeprefix('node_modules/'))+'-'+path.name)
            shutil.copyfile(path,dest)
        records.append({'type':'npm','name':folder.removeprefix('node_modules/'),'version':package['version'],'licenses':[p.name for p in files]})
    (LICENSES/'manifest.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
    print(f'Captured license notices for {len(records)} dependencies and the bundled font.')

if __name__=='__main__':main()
