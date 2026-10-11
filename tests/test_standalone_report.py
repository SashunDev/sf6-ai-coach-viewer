"""P4-A standalone viewer tests. Synthetic data only: never commit user's replay."""
import base64
import copy
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import build_standalone_report as app

FAKE_TEMPLATE = '''<!doctype html><html><body><script id="coach-report-data" type="application/json">{"schemaVersion":1}</script><script>
(()=>{
function verifyReport(data){return data}
function setVideoFile(file){return file}
function renderReportMeta(){}
function choose(i,b){}
function refresh(){}
function loadReportFromHash(){}
renderReportMeta();choose(0,false);refresh();
void loadReportFromHash();
window.addEventListener('hashchange',()=>void loadReportFromHash());
})();
</script></body></html>'''


def fixture():
    return dict(
        schemaVersion=1,
        match=dict(id='match-001',self='Alex',opponent='Terry',
                   scoreSelf=1,scoreOpponent=2,style='Classic',durationSec=16.0,
                   analysisMode='Review',mainFocus='SA3',mainFocusNote='User confirmed'),
        coaching=dict(summary='Summary',primaryTheme='SA3',secondaryTheme=None),
        events=[dict(id='E01',round='ROUND 01',start=2.0,end=4.0,category='good',
                     tag='Good',title='Stun',short='Review',observed='Hit',
                     judgment='Observed',action='Execute',success='Damage')],
    )


class StandaloneTest(unittest.TestCase):
    def test_round_trip_embedded_video_and_report(self):
        data=fixture()
        video=b'\x00\x00\x00\x18ftypisom'+b'0'*28
        html=app.build(FAKE_TEMPLATE,data,video)
        self.assertEqual(json.loads(html.split('<script id="coach-report-data" type="application/json">',1)[1].split('</script>',1)[0]),data)
        encoded=html.split('<script id="embedded-video" type="text/plain">',1)[1].split('</script>',1)[0]
        self.assertEqual(base64.b64decode(encoded),video)
        self.assertIn('void loadEmbeddedMatch();',html)
        self.assertIn('function setVideoFile(file)',html)
        self.assertNotIn('void loadReportFromHash();',html)
        self.assertNotIn("window.addEventListener('hashchange'",html)
        self.assertIn('i+=65536',html)

    def test_injection_not_executable(self):
        data=fixture()
        data['coaching']['summary']='</script><script>alert(1)</script> & test'
        html=app.build(FAKE_TEMPLATE,data,b'abc')
        raw=html.split('<script id="coach-report-data" type="application/json">',1)[1].split('</script>',1)[0]
        self.assertEqual(json.loads(raw),data)
        self.assertNotIn('</script>',raw)
        self.assertIn(r'\u003c',raw)

    def test_reject_invalid_data(self):
        for bad in (True,'12',-1):
            data=fixture();data['events'][0]['start']=bad
            with self.assertRaises(ValueError):app.validate_report(data)
        for bad in ('../secret','日本語','a'*81):
            data=fixture();data['match']['id']=bad
            with self.assertRaises(ValueError):app.validate_report(data)
        data=fixture();data['match']['scoreSelf']=True
        with self.assertRaises(ValueError):app.validate_report(data)
        data=fixture();data['events'].append(copy.deepcopy(data['events'][0]))
        with self.assertRaises(ValueError):app.validate_report(data)

    def test_reject_changed_template(self):
        for bad in (
            FAKE_TEMPLATE.replace('function setVideoFile(file)','function noVideo(file)'),
            FAKE_TEMPLATE.replace('void loadReportFromHash();',''),
            FAKE_TEMPLATE.replace('id="coach-report-data"','id="other"')
        ):
            with self.assertRaises(ValueError):app.build(bad,fixture(),b'abc')

    def test_reject_fake_and_incompatible_mp4(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'match-001.mp4'
            path.write_bytes(b'garbage')
            with self.assertRaisesRegex(ValueError,'ftyp'):app.inspect_video(path,16)
            path.write_bytes(b'\x00\x00\x00\x18ftypisom'+b'0'*20)
            with patch.object(app.shutil,'which',return_value='ffprobe'):
                with patch.object(app.subprocess,'run',return_value=subprocess.CompletedProcess([],0,json.dumps({'streams':[{'codec_type':'video','codec_name':'hevc'}],'format':{'duration':'16'}}),'')):
                    with self.assertRaisesRegex(ValueError,'H.264'):app.inspect_video(path,16)
                with patch.object(app.subprocess,'run',return_value=subprocess.CompletedProcess([],0,json.dumps({'streams':[{'codec_type':'video','codec_name':'h264'}],'format':{'duration':'99'}}),'')):
                    with self.assertRaisesRegex(ValueError,'duration'):app.inspect_video(path,16)

    def test_cli_valid_and_inconsistent_id(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            template=root/'index.html';template.write_text(FAKE_TEMPLATE)
            report=root/'match-001.json';report.write_text(json.dumps(fixture()))
            video=root/'match-001.mp4';video.write_bytes(b'\x00\x00\x00\x18ftypisom'+b'0'*20)
            out=root/'bundle.html'
            with patch.object(app.shutil,'which',return_value=None):
                self.assertEqual(app.main(['--template',str(template),'--report',str(report),'--video',str(video),'--out',str(out)]),0)
            self.assertTrue(out.is_file())
            self.assertFalse((root/'bundle.html.tmp').exists())
            wrong=root/'wrong.mp4';wrong.write_bytes(video.read_bytes())
            with self.assertRaises(SystemExit):
                app.main(['--template',str(template),'--report',str(report),'--video',str(wrong),'--out',str(out)])

    def test_actual_canonical_template_and_javascript_syntax(self):
        path=Path(__file__).resolve().parents[1]/'index.html'
        if not path.exists():
            self.skipTest('Canonical template not available in this checkout')
        html=app.build(path.read_text(encoding='utf8'),fixture(),b'\x00\x00\x00\x18ftypisom')
        for id_ in ('matchVideo','sceneList','seek','loopMode','coach-report-data','embedded-video'):
            self.assertIn('id="'+id_+'"',html)
        self.assertEqual(html.count('id="coach-report-data"'),1)
        if shutil.which('node'):
            js='(()=>{'+html.rsplit('<script>\n(()=>{',1)[1].split('</script>',1)[0]
            with tempfile.TemporaryDirectory() as d:
                src=Path(d)/'viewer.cjs';src.write_text(js)
                p=subprocess.run(['node','--check',str(src)],capture_output=True,text=True)
                self.assertEqual(p.returncode,0,p.stderr)


if __name__=='__main__':
    unittest.main()
