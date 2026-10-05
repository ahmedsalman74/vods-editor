import importlib.util
import io
import json
from pathlib import Path
import stat
import tempfile
import tomllib
import unittest
from unittest.mock import patch
from zipfile import ZipFile, ZipInfo

REPO=Path(__file__).resolve().parents[1]
def module(name):
    spec=importlib.util.spec_from_file_location(name,REPO/'scripts'/f'{name}.py')
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result
setup=module('setup');importer=module('import_local_engine')
ENTRY={'command':'C:\\Program Files\\nodejs\\node.exe','args':['C:\\My Repo\\server\\index.js'],'env':{'RLB_STATE_DIR':'D:/VodsEditor/bridge-state'}}

class SetupTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.patch=patch.object(setup,'REPO',self.root);self.patch.start()
    def tearDown(self):self.patch.stop();self.tmp.cleanup()
    def test_json_preserves_unrelated_and_backs_up(self):
        p=self.root/'client.json';old={'other':{'feature':True},'mcpServers':{'unrelated':{'command':'keep'}}}
        p.write_text(json.dumps(old),encoding='utf-8')
        setup.merge_json(p,ENTRY)
        data=json.loads(p.read_text());self.assertEqual(data['other'],old['other'])
        self.assertEqual(data['mcpServers']['unrelated'],old['mcpServers']['unrelated'])
        self.assertEqual(data['mcpServers']['davinci-resolve'],ENTRY)
        copies=list((self.root/'.local/backups').rglob('client.json'))
        self.assertEqual(len(copies),1);self.assertEqual(json.loads(copies[0].read_text()),old)
        setup.merge_json(p,ENTRY);self.assertEqual(len(list((self.root/'.local/backups').rglob('client.json'))),1)
    def test_conflict_requires_replace(self):
        p=self.root/'client.json';p.write_text(json.dumps({'mcpServers':{'davinci-resolve':{'command':'old'}}}))
        before=p.read_bytes()
        with self.assertRaises(ValueError):setup.merge_json(p,ENTRY)
        self.assertEqual(before,p.read_bytes())
        setup.merge_json(p,ENTRY,True);self.assertEqual(json.loads(p.read_text())['mcpServers']['davinci-resolve'],ENTRY)
    def test_toml_replace_preserves_comments_dates_and_other_tables(self):
        p=self.root/'config.toml';p.write_text('# keep this comment\nupdated = 1979-05-27T07:32:00Z\n[mcp_servers.other]\ncommand = "keep"\n[mcp_servers.davinci-resolve]\ncommand = "old"\nargs = []\n[mcp_servers.davinci-resolve.env]\nOLD = "1"\n[features]\nsomething = true\n')
        old=tomllib.loads(p.read_text())
        with self.assertRaises(ValueError):setup.merge_codex(p,ENTRY)
        setup.merge_codex(p,ENTRY,True);new=tomllib.loads(p.read_text())
        self.assertEqual(new['mcp_servers']['davinci-resolve'],ENTRY)
        self.assertEqual(new['features'],old['features']);self.assertEqual(new['updated'],old['updated'])
        self.assertEqual(new['mcp_servers']['other'],old['mcp_servers']['other'])
        self.assertIn('# keep this comment',p.read_text())
    def test_ambiguous_quoted_table_is_not_overwritten(self):
        p=self.root/'config.toml';p.write_text('[mcp_servers."davinci-resolve"]\ncommand="old"\n')
        before=p.read_bytes()
        with self.assertRaises(Exception):setup.merge_codex(p,ENTRY,True)
        self.assertEqual(p.read_bytes(),before)
    def test_dry_run_does_not_write_or_install(self):
        with patch('sys.argv',['setup.py','--edition','free','--client','codex','--data-dir',str(self.root/'data'),'--dry-run']),patch.object(setup.Path,'home',return_value=self.root),patch.object(setup,'run') as run,patch('sys.stdout',new=io.StringIO()):
            setup.main();run.assert_not_called()
        self.assertEqual(list(self.root.iterdir()),[])

class ArchiveTests(unittest.TestCase):
    def archive(self,name,symlink=False):
        data=io.BytesIO()
        with ZipFile(data,'w') as z:
            z.writestr('sample-engine/SKILL.md','original attribution')
            info=ZipInfo(name)
            if symlink:info.external_attr=(stat.S_IFLNK|0o777)<<16
            z.writestr(info,'data')
        data.seek(0);return ZipFile(data)
    def test_traversal_and_links_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name in ['../outside','/absolute','C:/absolute','sample-engine/../../outside','safe:stream']:
                with self.subTest(name=name),self.archive(name) as z,self.assertRaises(ValueError):importer.validate_members(z,Path(tmp))
            with self.archive('link',True) as z,self.assertRaises(ValueError):importer.validate_members(z,Path(tmp))
    def test_valid_import_stays_in_private_destination(self):
        with tempfile.TemporaryDirectory() as tmp,self.archive('sample-engine/scripts/helper.py') as z:
            entries=importer.validate_members(z,Path(tmp))
            self.assertEqual(entries[0][1],Path(tmp).resolve()/'SKILL.md')
            self.assertTrue(all(p.is_relative_to(Path(tmp).resolve()) for _,p in entries))

if __name__=='__main__':unittest.main()
