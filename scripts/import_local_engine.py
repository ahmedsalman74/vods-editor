"""Import a user-supplied engine archive locally; never add it to the public skills tree."""
import argparse
from pathlib import Path, PurePosixPath
import stat
from zipfile import ZipFile
REPO=Path(__file__).resolve().parents[1]

def validate_members(z, destination):
    entries=[];total=0
    for item in z.infolist():
        raw=item.filename.replace('\\','/')
        parts=PurePosixPath(raw).parts
        if not parts:continue
        if raw.startswith('/') or '..' in parts or any(':' in part for part in parts) or stat.S_ISLNK(item.external_attr>>16):
            raise ValueError('Unsafe archive member: '+raw)
        if parts[0]=='video-editor-bassam':parts=parts[1:]
        if not parts:continue
        target=destination.joinpath(*parts).resolve()
        if not target.is_relative_to(destination.resolve()):raise ValueError('Archive entry escapes destination')
        total+=item.file_size
        if total>512*1024**2:raise ValueError('Archive expands beyond 512 MB; review it manually.')
        entries.append((item,target))
    if not any(target.name=='SKILL.md' for _,target in entries):raise ValueError('No SKILL.md found in the archive')
    return entries

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('archive',type=Path);a=p.parse_args()
    destination=REPO/'.local/engines/video-editor-salman'
    if destination.exists():raise SystemExit('Local engine already exists; preserved. Choose a new checkout for another import.')
    with ZipFile(a.archive) as z:
        entries=validate_members(z,destination)
        for item,target in entries:
            if item.is_dir():target.mkdir(parents=True,exist_ok=True)
            else:target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(item))
    print('Imported locally:',destination)
    print('Original attribution and data paths preserved. This directory is ignored by Git; publication rights are not established.')

if __name__=='__main__':main()
