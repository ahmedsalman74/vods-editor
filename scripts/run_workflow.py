"""Run the workflow with the data directory chosen during setup."""
import json, os, runpy
from pathlib import Path
repo=Path(__file__).resolve().parents[1]
settings=repo/'.local/settings.json'
if settings.exists():
    os.environ.setdefault('VODS_EDITOR_HOME',json.loads(settings.read_text(encoding='utf-8'))['data_dir'])
runpy.run_path(str(repo/'workflow.py'),run_name='__main__')
