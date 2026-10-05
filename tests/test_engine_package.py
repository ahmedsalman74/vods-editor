"""Check the shipped engine is complete and preserves existing user data routing."""
import ast
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ENGINE=Path(__file__).resolve().parents[1]/'skills/video-editor-salman'

class EnginePackageTests(unittest.TestCase):
    def test_supplied_files_preserved_except_documented_adaptations(self):
        manifest=json.loads((ENGINE/'SOURCE_FILES.json').read_text(encoding='utf-8'))
        adapted={'SKILL.md','scripts/_paths.py','scripts/_paths.js','scripts/04b_remotion.sh'}
        for entry in manifest['files']:
            with self.subTest(path=entry['path']):
                file=ENGINE/entry['path'];self.assertTrue(file.is_file())
                if entry['path'] not in adapted:
                    # Git checkout newline conversion is not a source-code change.
                    content=file.read_bytes()
                    hashes={hashlib.sha256(content).hexdigest(),hashlib.sha256(content.replace(b'\r\n',b'\n')).hexdigest()}
                    self.assertTrue(entry['sha256'] in hashes or entry.get('normalized_sha256') in hashes)

    def test_all_python_sources_parse(self):
        for p in ENGINE.rglob('*.py'):
            with self.subTest(path=str(p)):ast.parse(p.read_text(encoding='utf-8-sig'),filename=str(p))

    def test_python_data_directory_priority_and_legacy_compatibility(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp);legacy=home/'Documents/previous-editor-data'
            def resolved(env):
                spec=importlib.util.spec_from_file_location('engine_paths',ENGINE/'scripts/_paths.py')
                module=importlib.util.module_from_spec(spec)
                with patch.dict(os.environ,env,clear=True),patch('os.path.expanduser',return_value=str(home)):
                    spec.loader.exec_module(module)
                return Path(module.HOME)
            self.assertEqual(resolved({}),home/'Documents/video-editor-salman')
            self.assertFalse((home/'Documents').exists())
            legacy.mkdir(parents=True)
            self.assertEqual(resolved({'VEB_HOME':str(legacy)}),legacy)
            self.assertEqual(resolved({'VEB_HOME':str(home/'old-override')}),home/'old-override')
            self.assertEqual(resolved({'VEB_HOME':str(legacy),'VES_HOME':str(home/'new-override')}),home/'new-override')

    @unittest.skipUnless(shutil.which('node'),'Node required for JavaScript checks')
    def test_javascript_data_directory_matches_python_contract(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp);legacy=home/'Documents/previous-editor-data'
            code="require('os').homedir=()=>process.env.ENGINE_TEST_HOME;console.log(require(process.env.ENGINE_PATHS).HOME)"
            def resolved(extra):
                env=dict(os.environ);env.pop('VES_HOME',None);env.pop('VEB_HOME',None)
                env.update(ENGINE_TEST_HOME=str(home),ENGINE_PATHS=str(ENGINE/'scripts/_paths.js'));env.update(extra)
                return Path(subprocess.check_output([shutil.which('node'),'-e',code],env=env,text=True).strip())
            self.assertEqual(resolved({}),home/'Documents/video-editor-salman')
            legacy.mkdir(parents=True);self.assertEqual(resolved({'VEB_HOME':str(legacy)}),legacy)
            self.assertEqual(resolved({'VEB_HOME':str(home/'old-override')}),home/'old-override')
            self.assertEqual(resolved({'VEB_HOME':str(legacy),'VES_HOME':str(home/'new-override')}),home/'new-override')

    @unittest.skipUnless(shutil.which('node'),'Node required for JavaScript checks')
    def test_javascript_scripts_parse_without_execution(self):
        for p in (ENGINE/'scripts').glob('*.js'):
            with self.subTest(path=p.name):
                result=subprocess.run([shutil.which('node'),'--check',str(p)],capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stderr)

if __name__=='__main__':unittest.main()
