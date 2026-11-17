"""Portable checks and packaging. No publishing or silent tool installation."""
import argparse
import gzip
import hashlib
import json
import os
import platform
import plistlib
import re
import shutil
import struct
import subprocess
import sys
import tarfile
import time
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
HOST={'Darwin':'darwin','Windows':'windows','Linux':'linux'}[platform.system()]
ARCH='arm64' if platform.machine().lower() in ('arm64','aarch64') else 'amd64'
TARGETS=[('darwin','arm64'),('darwin','amd64'),('windows','arm64'),('windows','amd64'),('linux','amd64'),('linux','arm64')]

def run(args,**kw):
    print('+ '+' '.join(map(str,args)),flush=True)
    kw.setdefault('cwd',ROOT)
    return subprocess.run(list(map(str,args)),check=True,**kw)

def output(args,**kw):
    kw.setdefault('cwd',ROOT)
    return subprocess.check_output(list(map(str,args)),text=True,**kw).strip()

def npm(*args,version=None):
    executable=shutil.which('npm.cmd' if HOST=='windows' else 'npm') or 'npm'
    command=[executable,*args]
    if HOST=='windows':
        script=Path(executable).parent/'node_modules/npm/bin/npm-cli.js'
        if not script.is_file():raise RuntimeError('Use a Node installation with node_modules/npm/bin/npm-cli.js beside npm.cmd')
        command=['node',script,*args]
    env=os.environ.copy()
    if version is not None:env['BIBLE_APP_VERSION']=version
    return run(command,cwd=ROOT/'frontend',env=env)

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def validate_desktop_target(args,native=False):
    target=f'{args.os}/{args.arch}';host=f'{HOST}/{ARCH}'
    guidance=(f'To obtain all six target packages from CI, '
              f'authenticate GitHub CLI as xibolun and run: make release-artifacts REF=main VERSION={args.version}. '
              'CI builds on the matching native runners.')
    if (args.os,args.arch) not in TARGETS:
        supported=', '.join(f'{osname}/{arch}' for osname,arch in TARGETS)
        raise RuntimeError(f'Unsupported desktop target {target} on host {host}. Supported targets: {supported}. {guidance}')
    if native and args.os!=HOST:
        raise RuntimeError(f'Native build/package for {target} requires a {args.os} host; current host is {host}. {guidance}')
    if args.os=='linux' and (HOST!='linux' or args.arch!=ARCH):
        raise RuntimeError(f'Linux CGO build/package for {target} requires a matching native {target} host; current host is {host}. {guidance}')
    if not native and args.os=='darwin' and HOST!='darwin':
        raise RuntimeError(f'Compiling {target} requires the native macOS toolchain; current host is {host}. {guidance}')

def linux_dependencies(packaging=False):
    command='sudo apt-get install build-essential pkg-config libgtk-4-dev libwebkitgtk-6.0-dev libx11-dev dpkg-dev'
    if not (shutil.which('gcc') or shutil.which('clang')) or not shutil.which('pkg-config'):
        raise RuntimeError(f'Linux desktop builds need a C compiler and pkg-config. On Ubuntu/Debian run: {command}')
    probe=subprocess.run(['pkg-config','--exists','gtk4 >= 4.14','webkitgtk-6.0 >= 2.44','x11'],capture_output=True,text=True)
    if probe.returncode:
        raise RuntimeError(f'Linux desktop builds need GTK4 >= 4.14, WebKitGTK 6.0 >= 2.44 and X11 development files. On Ubuntu/Debian run: {command}')
    if packaging and not all(shutil.which(tool) for tool in ('dpkg-deb','dpkg-shlibdeps')):
        raise RuntimeError('Debian packaging tools missing. On Ubuntu/Debian run: sudo apt-get install dpkg-dev')

def cli():
    cached=ROOT/'.cache'/('wails3.exe' if HOST=='windows' else 'wails3')
    found=str(cached) if cached.is_file() else shutil.which('wails3')
    if not found:raise RuntimeError('Wails CLI missing. Install explicitly: go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0')
    assert re.search(r'\bmod\s+github.com/wailsapp/wails/v3\s+v3\.1\.0\b',output(['go','version','-m',found])),'Wails CLI must be v3.1.0'
    return found

def verify_data():
    manifest=json.loads((ROOT/'data/manifest.json').read_text(encoding='utf-8'))
    assert sha(ROOT/'internal/bible/dataset.json.gz')==manifest['datasetSha256'],'bundled dataset checksum changed'
    raw=gzip.decompress((ROOT/'internal/bible/dataset.json.gz').read_bytes())
    assert hashlib.sha256(raw).hexdigest()==manifest['plainSha256']
    assert (ROOT/'frontend/public/dataset.json').read_bytes()==raw,'Mock/native data diverged'
    d=json.loads(raw);assert len(d['books'])==66 and {tr['id'] for tr in d['translations']}=={'cuv','webp','kjv'}
    assert {source['id'] for source in manifest['sources']}=={tr['id'] for tr in d['translations']}
    for tr in d['translations']:
        count=0
        for book in d['books']:
            for ch in range(1,book['chapters']+1):
                rows=d['chapters'][f"{tr['id']}/{book['id']}/{ch}"]
                assert rows and all(v['text'] for v in rows)
                assert len({v['label'] for v in rows})==len(rows)
                count+=len(rows)
        assert count==manifest['verses'][tr['id']]
    font=json.loads((ROOT/'data/font.json').read_text(encoding='utf-8'))
    assert sha(ROOT/'frontend/public/fonts/bible-sans.woff2')==font['sha256']
    assert (ROOT/'licenses/font-Noto-CJK.txt').is_file()
    assert (ROOT/'licenses/scripture-KJV-source.conf').read_bytes()==(ROOT/'data/KJV-source.conf').read_bytes()
    study_manifest=json.loads((ROOT/'data/word-study-manifest.json').read_text(encoding='utf-8'))
    study_compressed=(ROOT/'internal/bible/word-study.json.gz').read_bytes()
    study_raw=gzip.decompress(study_compressed)
    assert hashlib.sha256(study_compressed).hexdigest()==study_manifest['datasetSha256']
    assert hashlib.sha256(study_raw).hexdigest()==study_manifest['plainSha256']
    assert (ROOT/'frontend/public/word-study.json').read_bytes()==study_raw,'Mock/native word study diverged'
    study=json.loads(study_raw)
    assert len(study['entries'])==study_manifest['entries'] and len(study['verses'])==31102
    assert study['entries']['G3056']['lemma']=='λόγος' and study['entries']['H430']['lemma']
    chinese_manifest=json.loads((ROOT/'data/chinese-dictionary-manifest.json').read_text(encoding='utf-8'))
    chinese_compressed=(ROOT/'internal/bible/chinese-dictionary.json.gz').read_bytes()
    chinese_raw=gzip.decompress(chinese_compressed)
    assert hashlib.sha256(chinese_compressed).hexdigest()==chinese_manifest['datasetSha256']
    assert hashlib.sha256(chinese_raw).hexdigest()==chinese_manifest['plainSha256']
    assert (ROOT/'frontend/public/chinese-dictionary.json').read_bytes()==chinese_raw
    chinese=json.loads(chinese_raw)
    assert len(chinese)==chinese_manifest['entries'] and '話語' in chinese['G3056']['definition'] and '神' in chinese['H430']['definition']
    assert all((ROOT/'licenses/word-study-fhl'/name).is_file() for name in ['dhfhl.txt','dgfhl.txt','FDL-1.1.txt','NOTICE.md','publisher-copyright.txt'])
    print('Verified complete CUV/WEBP/KJV data, source manifests and bundled font.')

def verify_branding():
    bad=re.compile(r'(Wails\s*(?:logo|\+|version)|Built\s+(?:with|using)\s+Wails|My Company|My Product|wails\.png|GreetService|Welcome to Wails)',re.I)
    files=list((ROOT/'frontend/src').rglob('*.tsx'))+list((ROOT/'build').rglob('*.nsi'))+list((ROOT/'build').rglob('*.manifest'))+list((ROOT/'build').rglob('*.desktop'))+[ROOT/'frontend/index.html',ROOT/'frontend/public/bible.svg']
    for path in files:assert not bad.search(path.read_text(encoding='utf-8')),f'default branding in {path.relative_to(ROOT)}'
    assert not list((ROOT/'frontend/public').glob('*wails*'))
    for path in ['build/appicon.png','build/windows/icon.ico','build/darwin/icons.icns']:assert (ROOT/path).is_file(),f'missing owned icon: {path}'
    for size in [16,24,32,48,64,128,256,512]:
        icon=(ROOT/f'build/linux/icons/hicolor/{size}x{size}/apps/io.github.xibolun.bible.png').read_bytes()
        assert icon[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack_from('>II',icon,16)==(size,size),'invalid Linux icon size'
    assert (ROOT/'build/linux/icons/hicolor/scalable/apps/io.github.xibolun.bible.svg').read_bytes()==(ROOT/'frontend/public/bible.svg').read_bytes()
    for name,dimensions in [('welcome.bmp',(164,314)),('header.bmp',(150,57))]:
        bitmap=(ROOT/'build/windows'/name).read_bytes()
        assert bitmap[:2]==b'BM' and struct.unpack_from('<ii',bitmap,18)==dimensions,'invalid installer art: '+name
    installer=(ROOT/'build/windows/installer.nsi').read_text(encoding='utf-8')
    assert 'MUI_WELCOMEFINISHPAGE_BITMAP "welcome.bmp"' in installer and 'MUI_HEADERIMAGE_BITMAP "header.bmp"' in installer and '"DisplayIcon"' in installer
    print('Verified owned UI/icon/installer/metadata inputs; legal dependency notices are retained.')

def nsis():
    found=shutil.which('makensis')
    if found:return found
    for root in [os.environ.get('ProgramFiles(x86)',''),os.environ.get('ProgramFiles','')]:
        path=Path(root)/'NSIS/makensis.exe'
        if path.is_file():return str(path)
    return None

def doctor(args):
    validate_desktop_target(args,native=True)
    if HOST=='linux':linux_dependencies(packaging=True)
    for name in ['go','node','npm']:
        if not shutil.which(name+'.cmd' if HOST=='windows' and name=='npm' else name):raise RuntimeError(f'{name} missing')
    assert 'go1.26.10 ' in output(['go','version']),'Use pinned Go 1.26.10'
    assert tuple(map(int,output(['node','--version']).lstrip('v').split('.')))>=(22,12,0),'Node 22.12+ required'
    cli();verify_data();verify_branding()
    if args.os in ('darwin','windows'):
        if HOST=='darwin':run(['xcode-select','-p']);assert shutil.which('hdiutil')
        if HOST=='windows' and not nsis():raise RuntimeError('NSIS missing. Install explicitly and add makensis to PATH.')
    print(f'Doctor passed on {HOST}/{ARCH}; distribution targets are macOS, Windows and Linux.')

def check(version='v0.1.0'):
    if HOST=='linux':linux_dependencies()
    run([sys.executable,'-m','unittest','discover','-s','tools','-p','test_*.py'])
    files=[ROOT/'main.go',*list((ROOT/'internal').rglob('*.go'))]
    formatted=output(['gofmt','-l',*files]);assert not formatted,'Run gofmt on: '+formatted
    # Native main.go embeds the built frontend, so assets must exist before Go checks.
    npm('ci');npm('run','lint');npm('run','typecheck');npm('run','test','--','--run');npm('run','build',version=version)
    run(['go','vet','./...']);run(['go','test','./...'])
    verify_data();verify_branding()

def paths(args):
    root=ROOT/'bin'/f'{args.os}-{args.arch}';binary=root/('Bible.exe' if args.os=='windows' else 'Bible')
    return root,binary,ROOT/'dist'/args.version,f'bible-{args.version}-{args.os}-{args.arch}'

def binary_arch(path,osname,arch):
    b=path.read_bytes()
    if osname=='linux':
        if len(b)<20 or b[:6]!=b'\x7fELF\x02\x01' or struct.unpack_from('<H',b,18)[0]!={'amd64':62,'arm64':183}[arch]:
            raise RuntimeError(f'Expected a 64-bit little-endian Linux ELF for {arch}: {path.name}')
    elif osname=='windows':
        assert b[:2]==b'MZ';offset=struct.unpack_from('<I',b,60)[0];assert b[offset:offset+4]==b'PE\0\0'
        assert struct.unpack_from('<H',b,offset+4)[0]=={'amd64':0x8664,'arm64':0xaa64}[arch]
    else:
        assert b[:4]==b'\xcf\xfa\xed\xfe','not a 64-bit Mach-O'
        assert struct.unpack_from('<I',b,4)[0]=={'amd64':0x1000007,'arm64':0x100000c}[arch]

def compile_app(args):
    validate_desktop_target(args)
    if args.os=='linux':linux_dependencies()
    root,binary,_,_=paths(args);root.mkdir(parents=True,exist_ok=True)
    env=os.environ.copy();env.update(GOOS=args.os,GOARCH=args.arch,CGO_ENABLED='0' if args.os=='windows' else '1')
    if args.os=='darwin':env['MACOSX_DEPLOYMENT_TARGET']='12.0'
    syso=ROOT/f'bible_windows_{args.arch}.syso'
    if args.os=='windows':
        info={'fixed':{'file_version':args.version.lstrip('v')},'info':{'0000':{'ProductVersion':args.version.lstrip('v'),'CompanyName':'xibolun','FileDescription':'Bible desktop reader','ProductName':'Bible','LegalCopyright':'Bible contributors','Comments':'Offline Bible reader'}}}
        metadata=root/'info.json';metadata.write_text(json.dumps(info))
        run([cli(),'generate','syso','-arch',args.arch,'-icon','build/windows/icon.ico','-manifest','build/windows/app.manifest','-info',metadata,'-out',syso])
    flags=f'-s -w -X main.version={args.version}'+(' -H windowsgui' if args.os=='windows' else '')
    try:run(['go','build','-tags','dev' if args.dev else 'production','-trimpath','-ldflags',flags,'-o',binary,'.'],env=env)
    finally:syso.unlink(missing_ok=True)
    binary_arch(binary,args.os,args.arch)
    print(f'Compiled and inspected {args.os}/{args.arch}')

def manifest(args,dest,prefix,files,signing):
    result={'version':args.version,'os':args.os,'arch':args.arch,'commit':output(['git','rev-parse','HEAD']),'workingTreeDirty':bool(output(['git','status','--porcelain'])),'go':output(['go','version']),'node':output(['node','--version']),'wails':'v3.1.0','signing':signing,'dataset':json.loads((ROOT/'data/manifest.json').read_text()),'artifacts':{p.name:sha(p) for p in files}}
    if args.os=='linux':result['linux']={'buildHost':platform.platform(),'libc':platform.libc_ver(),'gtk':output(['pkg-config','--modversion','gtk4']),'webkit':output(['pkg-config','--modversion','webkitgtk-6.0']),'dependencies':output(['dpkg-deb','--field',next(p for p in files if p.suffix=='.deb'),'Depends'])}
    (dest/f'{prefix}-manifest.json').write_text(json.dumps(result,indent=2)+'\n')

def package_linux(args,root,binary,dest,prefix):
    linux_dependencies(packaging=True)
    bundle=root/prefix;shutil.rmtree(bundle,ignore_errors=True);bundle.mkdir()
    shutil.copy2(binary,bundle/'Bible');(bundle/'Bible').chmod(0o755)
    shutil.copy2(ROOT/'THIRD_PARTY_NOTICES.txt',bundle/'THIRD_PARTY_NOTICES.txt')
    shutil.copytree(ROOT/'licenses',bundle/'licenses')
    shutil.copy2(ROOT/'build/appicon.png',bundle/'icon.png')
    shutil.copy2(ROOT/'build/linux/io.github.xibolun.bible.apparmor',bundle/'bible.apparmor.example')
    (bundle/'README.txt').write_text('Bible desktop reader\nRun ./Bible in a graphical Linux session.\nRequires compatible glibc, GTK4 and WebKitGTK 6.0 system libraries.\nOn Ubuntu/Debian: sudo apt-get install libgtk-4-1 libwebkitgtk-6.0-4\nOn Ubuntu with restricted user namespaces, prefer the deb package: it loads an application-specific AppArmor profile for WebKit sandboxing.\nA tar binary needs an administrator-provided profile for its exact path; bible.apparmor.example shows the installed /usr/bin/bible policy.\nFile dialogs use the desktop xdg-desktop-portal service and a suitable backend.\nBuild-host and library versions are recorded in the accompanying manifest.\nAnnotations remain in your user configuration directory.\n',encoding='utf-8')
    archive=dest/f'{prefix}.tar.gz'
    with tarfile.open(archive,'w:gz') as target:target.add(bundle,arcname=prefix)
    stage=root/'debian/bible-desktop';shutil.rmtree(stage,ignore_errors=True)
    for folder in ('DEBIAN','etc/apparmor.d','usr/bin','usr/share/applications','usr/share/doc/bible-desktop'):(stage/folder).mkdir(parents=True,exist_ok=True)
    shutil.copy2(binary,stage/'usr/bin/bible');(stage/'usr/bin/bible').chmod(0o755)
    shutil.copy2(ROOT/'build/linux/io.github.xibolun.bible.desktop',stage/'usr/share/applications/io.github.xibolun.bible.desktop')
    shutil.copytree(ROOT/'build/linux/icons',stage/'usr/share/icons')
    shutil.copy2(ROOT/'THIRD_PARTY_NOTICES.txt',stage/'usr/share/doc/bible-desktop/copyright')
    shutil.copytree(ROOT/'licenses',stage/'usr/share/doc/bible-desktop/licenses')
    shutil.copy2(ROOT/'build/linux/io.github.xibolun.bible.apparmor',stage/'etc/apparmor.d/io.github.xibolun.bible')
    (stage/'DEBIAN/conffiles').write_text('/etc/apparmor.d/io.github.xibolun.bible\n')
    for path in stage.rglob('*'):
        path.chmod(0o755 if path.is_dir() or path==stage/'usr/bin/bible' else 0o644)
    for script in ('postinst','prerm'):
        shutil.copy2(ROOT/'build/linux'/script,stage/'DEBIAN'/script);(stage/'DEBIAN'/script).chmod(0o755)
    # dpkg-shlibdeps requires a Debian source control file even with -O output.
    (root/'debian').mkdir(exist_ok=True)
    (root/'debian/control').write_text('Source: bible-desktop\nSection: education\nPriority: optional\nMaintainer: xibolun <14323159+xibolun@users.noreply.github.com>\n\nPackage: bible-desktop\nArchitecture: any\nDescription: Offline bilingual Bible reader\n')
    dependencies=output(['dpkg-shlibdeps','-O',str(stage/'usr/bin/bible')],cwd=root)
    dependencies=next(line.removeprefix('shlibs:Depends=') for line in dependencies.splitlines() if line.startswith('shlibs:Depends='))
    control=(f'Package: bible-desktop\nVersion: {args.version.lstrip("v")}\nArchitecture: {args.arch}\nMaintainer: xibolun <14323159+xibolun@users.noreply.github.com>\nSection: education\nPriority: optional\nDepends: {dependencies}\nRecommends: apparmor, xdg-desktop-portal, xdg-desktop-portal-gtk\nDescription: Offline Chinese and English Bible reader\n Verse comparison, persistent highlights, copying and scripture-card PNG export.\n')
    (stage/'DEBIAN/control').write_text(control,encoding='utf-8')
    package=dest/f'{prefix}.deb';run(['dpkg-deb','--root-owner-group','--build',stage,package])
    if output(['dpkg-deb','--field',package,'Architecture'])!=args.arch:raise RuntimeError('Debian package architecture mismatch')
    manifest(args,dest,prefix,[archive,package],'unsigned; system GTK4/WebKitGTK libraries required')
    (dest/f'{prefix}-SHA256SUMS').write_text(''.join(f'{sha(path)}  {path.name}\n' for path in (archive,package,dest/f'{prefix}-manifest.json')))

def package_native(args):
    validate_desktop_target(args,native=True)
    if args.os=='linux':linux_dependencies(packaging=True)
    compile_app(args)
    root,binary,dest,prefix=paths(args);dest.mkdir(parents=True,exist_ok=True)
    if args.os=='darwin':
        app=root/'Bible.app';contents=app/'Contents';(contents/'MacOS').mkdir(parents=True,exist_ok=True);(contents/'Resources').mkdir(exist_ok=True)
        shutil.copy2(binary,contents/'MacOS/Bible');shutil.copy2(ROOT/'build/darwin/icons.icns',contents/'Resources/icons.icns')
        shutil.copy2(ROOT/'THIRD_PARTY_NOTICES.txt',contents/'Resources/THIRD_PARTY_NOTICES.txt');shutil.copytree(ROOT/'licenses',contents/'Resources/licenses',dirs_exist_ok=True)
        info={'CFBundleExecutable':'Bible','CFBundleIdentifier':'io.github.xibolun.bible','CFBundleName':'Bible','CFBundleDisplayName':'Bible','CFBundleShortVersionString':args.version.lstrip('v'),'CFBundleVersion':args.version.lstrip('v'),'CFBundleIconFile':'icons.icns','CFBundlePackageType':'APPL','NSHighResolutionCapable':True,'LSMinimumSystemVersion':'12.0','NSPrincipalClass':'NSApplication'}
        (contents/'Info.plist').write_bytes(plistlib.dumps(info))
        run(['codesign','--force','--deep','--sign','-',app]);run(['codesign','--verify','--deep','--strict',app])
        zipped=dest/f'{prefix}.zip';run(['ditto','-c','-k','--sequesterRsrc','--keepParent',app,zipped])
        stage=root/'dmg-stage';shutil.rmtree(stage,ignore_errors=True);stage.mkdir();shutil.copytree(app,stage/'Bible.app');(stage/'Applications').symlink_to('/Applications')
        dmg=dest/f'{prefix}.dmg';run(['hdiutil','create','-fs','HFS+','-volname','Bible','-srcfolder',stage,'-ov','-format','UDZO',dmg]);run(['hdiutil','verify',dmg])
        manifest(args,dest,prefix,[zipped,dmg],'adhoc; not notarized')
    elif args.os=='windows':
        executable=nsis()
        if not executable:raise RuntimeError('NSIS missing; run make doctor')
        zipped=dest/f'{prefix}.zip'
        with zipfile.ZipFile(zipped,'w',zipfile.ZIP_DEFLATED) as z:
            z.write(binary,'Bible.exe');z.write(ROOT/'THIRD_PARTY_NOTICES.txt','THIRD_PARTY_NOTICES.txt')
            for f in (ROOT/'licenses').rglob('*'):
                if f.is_file():z.write(f,str(f.relative_to(ROOT)))
        installer=dest/f'{prefix}-installer.exe'
        run([executable,f'/DOUTPUT={installer}',f'/DBINARY={binary}',f'/DNUMVERSION={args.version.lstrip("v")}',ROOT/'build/windows/installer.nsi'])
        manifest(args,dest,prefix,[zipped,installer],'unsigned')
    else:package_linux(args,root,binary,dest,prefix)
    print(f'Packaged {prefix}; no public release created.')

def dist(args):
    dest=ROOT/'dist'/args.version;expected=[];commits=set()
    for osname,arch in TARGETS:
        prefix=f'bible-{args.version}-{osname}-{arch}';mf=dest/f'{prefix}-manifest.json'
        assert mf.is_file(),f'missing target manifest: {mf.name}'
        info=json.loads(mf.read_text());assert info['os']==osname and info['arch']==arch and info['version']==args.version;commits.add(info['commit'])
        assert not info.get('workingTreeDirty',False),'dirty working-tree artifacts cannot be combined as a source-identified distribution'
        names=[f'{prefix}.tar.gz',f'{prefix}.deb'] if osname=='linux' else [f'{prefix}.zip',f'{prefix}.dmg' if osname=='darwin' else f'{prefix}-installer.exe'];assert set(info['artifacts'])==set(names)
        for name in names:
            path=dest/name;assert path.is_file() and sha(path)==info['artifacts'][name],f'absent or modified artifact: {name}';expected.append(path)
        expected.append(mf)
    assert len(commits)==1,'artifacts come from different commits'
    (dest/'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.name}\n' for p in sorted(expected)))
    print('Verified all six target manifests and package checksums.')

def smoke(args):
    assert args.os==HOST and args.arch==ARCH,'Runtime test requires matching native runner'
    root,binary,dest,prefix=paths(args);folder=root/'smoke';folder.mkdir(exist_ok=True)
    executable=root/'Bible.app/Contents/MacOS/Bible' if HOST=='darwin' else binary
    env=os.environ.copy();env['BIBLE_SMOKE_DIR']=str(folder)
    for attempt in range(2):
        report=folder/'native-smoke.json';report.unlink(missing_ok=True)
        run([executable,'--smoke-test'],env=env,timeout=45)
        assert report.is_file(),'native smoke never reported completion'
        result=json.loads(report.read_text());assert result['passed'],result
        png=(folder/'native-smoke-card.png').read_bytes();assert struct.unpack_from('>II',png,16)==(1080,1080)
        print(f'Native bridge run {attempt+1} passed; file-dialog interaction remains manual.')
    dest.mkdir(parents=True,exist_ok=True);shutil.copy2(report,dest/f'{prefix}-native-smoke.json')

def package_runs(runs,version):
    return [item for item in runs if item['event']=='workflow_dispatch'
            and item['workflowName']=='Desktop packages'
            and item['displayTitle'].startswith(f'Desktop packages {version} (')]

def release_artifacts(args):
    ref=args.ref;commit=output(['gh','api',f'repos/xibolun/bible/commits/{ref}','--jq','.sha'])
    def runs():return package_runs(json.loads(output(['gh','run','list','--repo','xibolun/bible','--commit',commit,'--json','databaseId,status,conclusion,event,workflowName,displayTitle','--limit','20'])),args.version)
    selected=runs()
    if not selected:
        run(['gh','workflow','run','desktop.yml','--repo','xibolun/bible','--ref',ref,'-f',f'version={args.version}'])
        for _ in range(20):
            selected=runs()
            if selected:break
            time.sleep(3)
    assert selected,'no build run found for requested ref'
    identifier=str(selected[0]['databaseId']);run(['gh','run','watch',identifier,'--repo','xibolun/bible','--exit-status'])
    dest=ROOT/'dist'/args.version;dest.mkdir(parents=True,exist_ok=True)
    run(['gh','run','download',identifier,'--repo','xibolun/bible','--name',f'bible-{args.version}-all-targets','--dir',dest]);dist(args)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('action');p.add_argument('--os',default=HOST);p.add_argument('--arch',default=ARCH);p.add_argument('--version',default='v0.1.0');p.add_argument('--ref',default='main');p.add_argument('--dev',action='store_true');args=p.parse_args()
    assert re.fullmatch(r'v?\d+\.\d+\.\d+',args.version),'VERSION must be a simple semantic version'
    if args.action=='help':print('make doctor | check | dev | build | package [GOOS=darwin|windows|linux GOARCH=arm64|amd64 VERSION=v0.1.0] | smoke | dist | release-artifacts REF=main | verify-data | verify-branding | bindings | clean\nBuild/package requires a matching native macOS/Windows/Linux host and declared system dependencies. Linux CGO builds require a matching architecture. Authenticate GitHub CLI as xibolun and run make release-artifacts REF=main for all six CI targets.')
    elif args.action=='doctor':doctor(args)
    elif args.action=='check':check(args.version)
    elif args.action=='verify-data':verify_data()
    elif args.action=='verify-branding':verify_branding()
    elif args.action=='compile':compile_app(args)
    elif args.action=='package-native':package_native(args)
    elif args.action in ('build','package'):
        validate_desktop_target(args,native=True)
        doctor(args);check(args.version);run([cli(),'task',args.action,f'TARGET_OS={args.os}',f'TARGET_ARCH={args.arch}',f'VERSION={args.version}'])
    elif args.action=='bindings':
        if not (ROOT/'frontend/dist/index.html').is_file():
            (ROOT/'frontend/dist').mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/'frontend/index.html',ROOT/'frontend/dist/index.html')
        env=os.environ.copy();env.update(GOOS=args.os if args.os in ('windows','darwin') else 'windows',CGO_ENABLED='0' if args.os!='darwin' else '1');run([cli(),'generate','bindings','-ts','-i','-names'],env=env)
    elif args.action=='dev':
        validate_desktop_target(args,native=True)
        doctor(args);npm('ci');npm('run','build',version=args.version);env=os.environ.copy();env['BIBLE_APP_VERSION']=args.version;env['PATH']=str(Path(cli()).parent)+os.pathsep+env.get('PATH','');run([cli(),'dev'],env=env)
    elif args.action=='run-native':
        validate_desktop_target(args,native=True)
        _,binary,_,_=paths(args);run([binary])
    elif args.action=='dist':dist(args)
    elif args.action=='smoke':smoke(args)
    elif args.action=='release-artifacts':release_artifacts(args)
    elif args.action=='clean':
        for directory in ['bin','dist','frontend/dist']:shutil.rmtree(ROOT/directory,ignore_errors=True)
    else:raise RuntimeError(f'unknown action: {args.action}')

if __name__=='__main__':
    try:main()
    except (AssertionError,RuntimeError,subprocess.CalledProcessError,subprocess.TimeoutExpired) as error:
        print(f'ERROR: {error}',file=sys.stderr);sys.exit(1)
