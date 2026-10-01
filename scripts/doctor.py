"""Check Free MCP and read project information. Never edits or saves a project."""
import argparse, asyncio, json, os, shutil, sys
from pathlib import Path
from datetime import timedelta
REPO=Path(__file__).resolve().parents[1]

async def inspect_session(session):
    await session.initialize();print('MCP tools:',len((await session.list_tools()).tools))
    result=await session.call_tool('resolve_status',{})
    status=result.structuredContent or {}
    print(json.dumps(status,indent=2))
    if result.isError or not status.get('alive'):
        print('NOT CONNECTED:',status.get('start_instruction') or status.get('detail') or 'Check Resolve and start its Lua bridge.')
        return 1
    for tool in ['get_project_info','list_timelines']:
        reply=await session.call_tool(tool,{})
        print(tool,json.dumps(reply.structuredContent or reply.model_dump(mode='json'),indent=2))
        if reply.isError:return 1
    print('PASS: read-only Resolve project checks.')
    return 0

async def main():
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',type=Path,default=REPO/'.local/mcp-free.json');a=p.parse_args()
    if not a.config.exists():raise SystemExit('No Free MCP config. Run setup --edition free, or use Studio native tools as documented in docs/studio.md.')
    config=json.loads(a.config.read_text(encoding='utf-8'))
    print(json.dumps({'ffmpeg':shutil.which('ffmpeg'),'ffprobe':shutil.which('ffprobe'),'python':sys.version.split()[0]},indent=2))
    params=StdioServerParameters(command=config['command'],args=config['args'],env=dict(os.environ,**config.get('env',{})))
    async with stdio_client(params) as (r,w):
        async with ClientSession(r,w,read_timeout_seconds=timedelta(seconds=45)) as session:
            return await inspect_session(session)

if __name__=='__main__':sys.exit(asyncio.run(main()))
