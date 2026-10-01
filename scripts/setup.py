"""Install portable skills and the selected Resolve connection; preserve other settings."""
import argparse
import copy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tomllib
import venv

REPO = Path(__file__).resolve().parents[1]
SERVER = 'davinci-resolve'

def run(command, cwd=None):
    print('Running:', subprocess.list2cmdline([str(x) for x in command]), flush=True)
    subprocess.run([str(x) for x in command], cwd=cwd, check=True)

def backup(path):
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    if path.exists():
        destination=REPO/'.local'/'backups'/stamp/path.name
        destination.parent.mkdir(parents=True,exist_ok=True)
        if path.is_dir(): shutil.copytree(path,destination)
        else: shutil.copy2(path,destination)

def atomic_write(path, text):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(text,encoding='utf-8');tmp.replace(path)

def merge_json(path, entry, replace=False):
    data=json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else {}
    servers=data.setdefault('mcpServers',{})
    previous=servers.get(SERVER)
    if previous is not None and previous != entry and not replace:
        raise ValueError(f'{path} already has a different {SERVER} server. Use --replace only to intentionally replace it.')
    if previous==entry:return
    backup(path);servers[SERVER]=entry
    atomic_write(path,json.dumps(data,indent=2)+'\n')

def merge_codex(path, entry, replace=False):
    old=path.read_text(encoding='utf-8-sig') if path.exists() else ''
    before=tomllib.loads(old)
    previous=before.get('mcp_servers',{}).get(SERVER)
    if previous is not None and previous != entry and not replace:
        raise ValueError(f'{path} already has a different {SERVER} server. Use --replace intentionally.')
    if previous==entry:return
    # Do not reserialize unrelated TOML, which can contain comments and client-specific fields.
    kept=[];skip=False
    for line in old.splitlines(keepends=True):
        if line.lstrip().startswith('['):
            header=line.split('#',1)[0].strip()
            skip=header in (f'[mcp_servers.{SERVER}]',f'[mcp_servers.{SERVER}.env]')
        if not skip:kept.append(line)
    result=''.join(kept).rstrip()+f'\n\n[mcp_servers.{SERVER}]\n'
    result+='command = '+json.dumps(entry['command'])+'\nargs = '+json.dumps(entry['args'])+'\n'
    result+=f'\n[mcp_servers.{SERVER}.env]\n'+''.join(k+' = '+json.dumps(v)+'\n' for k,v in entry['env'].items())
    after=tomllib.loads(result)
    expected=copy.deepcopy(before);expected.setdefault('mcp_servers',{})[SERVER]=entry
    if after!=expected:raise ValueError('Refusing to alter an unsupported/ambiguous TOML server layout. Configure this server manually.')
    backup(path);atomic_write(path,result.lstrip('\n'))

def desktop_config(home):
    if sys.platform=='win32':
        local=Path(os.environ.get('LOCALAPPDATA',home/'AppData/Local'))
        candidates=list((local/'Packages').glob('Claude_*/LocalCache/Roaming/Claude'))
        if len(candidates)>1:raise ValueError('Multiple Claude Store installs found. Set --desktop-config explicitly.')
        if candidates:return candidates[0]/'claude_desktop_config.json'
        return Path(os.environ.get('APPDATA',home/'AppData/Roaming'))/'Claude/claude_desktop_config.json'
    if sys.platform=='darwin':return home/'Library/Application Support/Claude/claude_desktop_config.json'
    raise ValueError('Claude Desktop path is platform-specific; supply --desktop-config.')

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--edition',choices=['free','studio'],required=True)
    p.add_argument('--client',choices=['claude-code','claude-desktop','codex','all'],default='claude-code')
    p.add_argument('--data-dir',type=Path,default=Path.home()/'Documents/VodsEditor')
    p.add_argument('--analysis',action='store_true',help='Install optional Whisper/PyTorch analysis dependencies (large download).')
    p.add_argument('--replace',action='store_true',help='Back up and replace conflicting named MCP and skill installations.')
    p.add_argument('--dry-run',action='store_true',help='Show intended locations without installing or writing anything.')
    p.add_argument('--desktop-config',type=Path)
    a=p.parse_args();home=Path.home();data=a.data_dir.expanduser().resolve()
    clients=['claude-code','claude-desktop','codex'] if a.client=='all' else [a.client]
    skill_roots=[]
    if 'claude-code' in clients:skill_roots.append(home/'.claude/skills')
    if 'codex' in clients:skill_roots.append(Path(os.environ.get('CODEX_HOME',home/'.codex'))/'skills')
    paths={}
    if 'claude-code' in clients:
        if os.environ.get('CLAUDE_CONFIG_DIR'):
            raise ValueError('Custom CLAUDE_CONFIG_DIR is not supported by this installer. Register the generated server entry manually for that Claude profile.')
        paths['claude-code']=home/'.claude.json'
    if 'codex' in clients:paths['codex']=Path(os.environ.get('CODEX_HOME',home/'.codex'))/'config.toml'
    if 'claude-desktop' in clients:paths['claude-desktop']=a.desktop_config or desktop_config(home)
    print(json.dumps({'edition':a.edition,'data_dir':str(data),'clients':{k:str(v) for k,v in paths.items()},'skill_roots':[str(x) for x in skill_roots],'analysis':a.analysis},indent=2))
    if a.dry_run:return
    if sys.version_info<(3,11):raise RuntimeError('Python 3.11+ required; 3.12 recommended.')
    if a.edition=='free' and not str(data).isascii():raise ValueError('Choose an ASCII-only data path for the Windows Lua bridge.')
    for root in skill_roots:
        for source in (REPO/'skills').iterdir():
            if source.is_dir() and (root/source.name).exists() and not a.replace:
                raise ValueError(f'Skill already exists: {root/source.name}. Use --replace to update it with backup.')
    node=shutil.which('node');npm=shutil.which('npm.cmd' if sys.platform=='win32' else 'npm')
    if a.edition=='free' and (not node or not npm):raise RuntimeError('Install Node.js 20+ and reopen your terminal first.')
    entry={'command':node,'args':[str(REPO/'vendor/resolve-lua-mcp/server/index.js')],'env':{'RLB_STATE_DIR':(data/'bridge-state').as_posix(),'RLB_DEFAULT_TIMEOUT_S':'30'}}
    if a.edition=='free':
        for client,path in paths.items():
            if path.exists() and not a.replace:
                content=path.read_text(encoding='utf-8-sig')
                previous=(tomllib.loads(content).get('mcp_servers',{}) if client=='codex' else json.loads(content).get('mcpServers',{})).get(SERVER)
                if previous is not None and previous!=entry:raise ValueError(f'Different {SERVER} server in {path}; use --replace to replace with backup.')
    data.mkdir(parents=True,exist_ok=True)
    runtime=REPO/'.venv'
    if not runtime.exists():venv.EnvBuilder(with_pip=True).create(runtime)
    python=runtime/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
    run([python,'-m','pip','install','-r',REPO/'requirements.txt'])
    if a.analysis:run([python,'-m','pip','install','-r',REPO/'requirements-analysis.txt'])
    if a.edition=='free':
        bridge=REPO/'vendor/resolve-lua-mcp'
        run([npm,'ci'],cwd=bridge);run([npm,'run','build'],cwd=bridge)
        if sys.platform=='win32':
            fusion=Path(os.environ.get('APPDATA',home/'AppData/Roaming'))/'Blackmagic Design/DaVinci Resolve/Support/Fusion'
            if fusion.exists():(fusion/'Scripts/Utility').mkdir(parents=True,exist_ok=True)
        for client,path in paths.items():
            (merge_codex if client=='codex' else merge_json)(path,entry,a.replace)
        atomic_write(REPO/'.local/mcp-free.json',json.dumps(entry,indent=2))
    for root in skill_roots:
        for source in (REPO/'skills').iterdir():
            if not source.is_dir():continue
            target=root/source.name;backup(target);shutil.copytree(source,target,dirs_exist_ok=True)
            local=target/'references/local-install.md'
            atomic_write(local,f'# Local installation (generated, do not publish)\n\nRepository: `{REPO}`\nPython: `{python}`\nWorkflow: `{REPO / "workflow.py"}`\nData directory: `{data}`\nConnection: `{a.edition}`\n\nSet VODS_EDITOR_HOME to the data directory for every workflow command.\n')
    atomic_write(REPO/'.local/settings.json',json.dumps({'data_dir':str(data),'edition':a.edition,'python':str(python)},indent=2))
    if a.edition=='studio':print('Skills ready. Complete native MCP registration inside Resolve Studio: see docs/studio.md. Existing MCP configuration was preserved.')
    else:print('Run doctor.py to install/check bridge scripts, then start Workspace > Scripts > resolve_mcp_bridge in Resolve and run doctor.py again.')
    print('Reload the selected client. Claude Desktop chat gets MCP tools; the complete shell-based workflow requires Claude Code or Codex.')

if __name__=='__main__':main()
