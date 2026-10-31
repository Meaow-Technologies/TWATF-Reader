import importlib.util,json,shutil,tempfile,unittest,zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('builder',ROOT/'scripts/build.py');builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
class BuildTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
  shutil.copytree(ROOT/'website',self.root/'website')
  for v in builder.EDITIONS:
   (self.root/'chapters'/v).mkdir(parents=True)
   for n in [1,2]:shutil.copy2(ROOT/'chapters'/v/f'{n:04}.xhtml',self.root/'chapters'/v/f'{n:04}.xhtml')
 def tearDown(self):self.temp.cleanup()
 def test_giscus_headers_and_theme_version(self):
  import re
  headers=(ROOT/'website/_headers').read_text(encoding='utf-8')
  self.assertRegex(headers,r'(?m)^/giscus/\*\n(?:  .*\n)*  Access-Control-Allow-Origin: \*$')
  comments=(ROOT/'website/scripts/comments.js').read_text(encoding='utf-8')
  version=re.search(r'GISCUS_THEME_VERSION\s*=\s*"([^"]+)"',comments).group(1)
  for name in ['dark.css','light.css']:
   theme=(ROOT/'website/giscus'/name).read_text(encoding='utf-8')
   self.assertEqual(re.search(r'admin\.css\?v=([^"]+)',theme).group(1),version)
 def test_comment_voting_files_and_sort_controls(self):
  schema=(ROOT/'functions/schema.sql').read_text(encoding='utf-8')
  migration=(ROOT/'functions/migrations/0001_comment_votes.sql').read_text(encoding='utf-8')
  for ddl in [schema,migration]:
   self.assertIn('CREATE TABLE IF NOT EXISTS comment_votes',ddl)
   self.assertIn('PRIMARY KEY (comment_id, user_id)',ddl)
   self.assertIn('CHECK (value IN (-1, 1))',ddl)
  comments=(ROOT/'website/scripts/comments.js').read_text(encoding='utf-8')
  self.assertIn('"twatf-comment-sort"',comments)
  for mode,label in [('popular','Popular'),('oldest','Oldest'),('newest','Newest')]:
   self.assertIn(f'<option value="{mode}"',comments)
   self.assertIn(label,comments)
  self.assertTrue((ROOT/'functions/api/comments/[id]/vote.js').is_file())
 def test_comment_reaction_lists_match(self):
  import re
  server=(ROOT/'functions/_lib/comments.js').read_text(encoding='utf-8')
  client=(ROOT/'website/scripts/comments.js').read_text(encoding='utf-8')
  allowed=json.loads(re.search(r'ALLOWED_EMOJIS\s*=\s*new Set\((\[[^\]]*\])\)',server).group(1))
  emojis=json.loads(re.search(r'const EMOJIS\s*=\s*(\[[^\]]*\])',client).group(1))
  retired={'👍','👎','🚀'}
  added={'😭','🤗','💀'}
  for values in [allowed,emojis]:
   self.assertEqual(len(values),10)
   self.assertTrue(retired.isdisjoint(values))
   self.assertTrue(added.issubset(values))
  self.assertEqual(set(allowed),set(emojis))
  expected=['❤️','😂','😮','😢','😭','🤗','🎉','🔥','👀','💀']
  self.assertEqual(allowed,expected)
  self.assertEqual(emojis,expected)
 def test_correction_propagates_to_site_and_matching_epub(self):
  builder.build(self.root)
  p=self.root/'chapters/first/0001.xhtml';p.write_text(p.read_text().replace('</body>','<p>Verified correction &amp; punctuation.</p></body>'))
  # A stale generated file must not survive a subsequent build.
  (self.root/'dist/data/first/99.json').write_text('{}')
  builder.build(self.root)
  site=json.loads((self.root/'dist/data/first/1.json').read_text())
  self.assertIn('Verified correction &amp; punctuation.',site['html'])
  self.assertFalse((self.root/'dist/data/first/99.json').exists())
  for v in builder.EDITIONS:
   epub_name=builder.EPUB_NAMES[v]
   with zipfile.ZipFile(self.root/f'dist/assets/downloads/{epub_name}.epub') as z:
    content=z.read('OEBPS/chapter-1.xhtml').decode()
    self.assertEqual('Verified correction' in content,v=='first')
    builder.verify_epub(self.root/f'dist/assets/downloads/{epub_name}.epub',builder.read_chapters(self.root,v))
  self.assertIn('2 chapters',(self.root/'dist/index.html').read_text())
 def test_invalid_source_preserves_last_good_build(self):
  revised_epub=f'{builder.EPUB_NAMES["revised"]}.epub'
  builder.build(self.root);before=(self.root/f'dist/assets/downloads/{revised_epub}').read_bytes()
  (self.root/'chapters/revised/0001.xhtml').write_text('<broken>')
  with self.assertRaises(ValueError):builder.build(self.root)
  self.assertEqual(before,(self.root/f'dist/assets/downloads/{revised_epub}').read_bytes())
 def test_missing_chapter_fails(self):
  (self.root/'chapters/first/0001.xhtml').unlink()
  with self.assertRaises(ValueError):builder.build(self.root)
 def test_whitespace_after_body_preserves_chapter(self):
  p=self.root/'chapters/revised/0002.xhtml'
  p.write_text(p.read_text().replace('</body>','</body>\n  '))
  expected=''.join(ET.parse(p).getroot().find(builder.NS+'body').itertext())
  builder.build(self.root)
  revised_epub=f'{builder.EPUB_NAMES["revised"]}.epub'
  with zipfile.ZipFile(self.root/f'dist/assets/downloads/{revised_epub}') as z:
   actual=ET.fromstring(z.read('OEBPS/chapter-2.xhtml')).find(builder.NS+'body')
   self.assertEqual(''.join(actual.itertext()),expected)
 def test_discoverability_and_indexability(self):
  import re,xml.etree.ElementTree as ET
  builder.build(self.root)
  dist=self.root/'dist'
  # (a) out files exist
  expected_files=['first.html','revised.html','first/chapter-1.html','first/chapter-2.html','revised/chapter-1.html','revised/chapter-2.html','404.html','sitemap.xml','robots.txt']
  for f in expected_files:
   self.assertTrue((dist/f).is_file(),f'Missing expected file: {f}')
  # (b) chapter page contents, raw HTML, correct edition, data-prerendered, base, canonical, h1
  for v in builder.EDITIONS:
   for n in [1,2]:
    p=dist/v/f'chapter-{n}.html';content=p.read_text(encoding='utf-8')
    src_body=ET.parse(self.root/'chapters'/v/f'{n:04}.xhtml').getroot().find(builder.NS+'body')
    sample=max([''.join(el.itertext()).strip() for el in src_body.iter(builder.NS+'p')],key=len)
    self.assertIn(sample,content)
    self.assertIn(f'data-prerendered="{v}/{n}"',content)
    self.assertIn('<base href="/" />',content)
    canons=re.findall(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']',content)
    self.assertEqual(canons,[f'{builder.SITE_URL}/{v}/chapter-{n}'])
    self.assertEqual(len(re.findall(r'<h1[\s>]',content)),1)
    if v=='revised':
     first_body=ET.parse(self.root/'chapters/first'/f'{n:04}.xhtml').getroot().find(builder.NS+'body')
     first_sample=max([''.join(el.itertext()).strip() for el in first_body.iter(builder.NS+'p')],key=len)
     self.assertNotIn(first_sample,content)
  # (c) all <title> values and canonical URLs across generated pages are unique
  pages=list(dist.glob('*.html'))+[dist/'first/chapter-1.html',dist/'first/chapter-2.html',dist/'revised/chapter-1.html',dist/'revised/chapter-2.html']
  titles={};canonicals={}
  for p in pages:
   c=p.read_text(encoding='utf-8')
   tm=re.findall(r'<title>([^<]+)</title>',c)
   self.assertEqual(len(tm),1,f'{p.name}: expected 1 title')
   self.assertNotIn(tm[0],titles,f'Duplicate title {tm[0]}')
   titles[tm[0]]=p.name
   cm=re.findall(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']',c)
   if p.name=='404.html':self.assertEqual(len(cm),0)
   elif p.name=='chapters.html':self.assertEqual(cm,[f'{builder.SITE_URL}/revised'])
   else:
    self.assertEqual(len(cm),1,f'{p.name}: expected 1 canonical')
    self.assertNotIn(cm[0],canonicals,f'Duplicate canonical {cm[0]}')
    canonicals[cm[0]]=p.name
  # (d) rel="prev"/rel="next" targets are correct and absent at boundaries
  for v in builder.EDITIONS:
   c1=(dist/v/'chapter-1.html').read_text()
   self.assertNotIn('rel="prev"',c1)
   self.assertIn(f'rel="next" href="/{v}/chapter-2"',c1)
   c2=(dist/v/'chapter-2.html').read_text()
   self.assertIn(f'rel="prev" href="/{v}/chapter-1"',c2)
   self.assertNotIn('rel="next"',c2)
  # (e) every internal href starting with "/" resolves
  for p in pages:
   c=p.read_text(encoding='utf-8')
   for m in re.finditer(r'href=["\'](/[^"\'#?]*)[?#"\']',c):
    target=m.group(1).lstrip('/')
    if not target:resolved=(dist/'index.html').is_file()
    else:resolved=(dist/target).exists() or (dist/f'{target}.html').is_file()
    self.assertTrue(resolved,f'{p.name} internal href /{target} does not resolve')
  # (f) sitemap parses as XML, contains expected canonicals, excludes /chapters, no lastmod; robots references sitemap
  stree=ET.parse(dist/'sitemap.xml');surls=[el.find('{http://www.sitemaps.org/schemas/sitemap/0.9}loc').text for el in stree.getroot()]
  expected_urls={f'{builder.SITE_URL}/',f'{builder.SITE_URL}/first',f'{builder.SITE_URL}/revised',f'{builder.SITE_URL}/info',
                 f'{builder.SITE_URL}/first/chapter-1',f'{builder.SITE_URL}/first/chapter-2',
                 f'{builder.SITE_URL}/revised/chapter-1',f'{builder.SITE_URL}/revised/chapter-2'}
  self.assertEqual(set(surls),expected_urls)
  self.assertNotIn(f'{builder.SITE_URL}/chapters',surls)
  self.assertEqual(len(stree.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}lastmod')),0)
  robots=(dist/'robots.txt').read_text()
  self.assertIn('Sitemap: https://twatf.pages.dev/sitemap.xml',robots)
  self.assertIn('Disallow: /data/',robots)
  self.assertIn('Disallow: /assets/downloads/',robots)
  # (g) no generated page contains "{{"
  for p in pages:
   self.assertNotIn('{{',p.read_text(encoding='utf-8'),f'{p.name} contains leftover placeholder')
  # (h) generated pages carry ?v= on app.js/style.css, canonical/og have no ?v=
  for p in pages:
   c=p.read_text(encoding='utf-8')
   if 'app.js' in c:self.assertRegex(c,r'app\.js\?v=[0-9a-f]+')
   if 'style.css' in c:self.assertRegex(c,r'style\.css\?v=[0-9a-f]+')
   for cm in re.finditer(r'<link[^>]+rel=["\']canonical["\'][^>]+>',c):
    self.assertNotIn('?v=',cm.group())
   for om in re.finditer(r'<meta[^>]+property=["\']og:url["\'][^>]+>',c):
    self.assertNotIn('?v=',om.group())
if __name__=='__main__':unittest.main()
