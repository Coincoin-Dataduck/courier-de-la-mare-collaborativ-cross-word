# Prépare public/journal.css, les polices et les morceaux SVG à partir de la maquette validée
import re, shutil, os
M = '/data/maquette/grille.tpl.html'
P = '/data/courrier/public'
s = open(M).read()
css = re.findall(r'<style>(.*?)</style>', s, re.S)[0]
fonts = {'__C059R__': 'C059-Roman.otf', '__C059B__': 'C059-Bold.otf', '__C059I__': 'C059-Italic.otf', '__C059BI__': 'C059-BdIta.otf',
         '__NRB__': 'NimbusRoman-Bold.otf', '__NRR__': 'NimbusRoman-Regular.otf', '__NARB__': 'NimbusSansNarrow-Bold.otf',
         '__NARR__': 'NimbusSansNarrow-Regular.otf', '__NMB__': 'NimbusMonoPS-Bold.otf', '__Z003__': 'Z003-MediumItalic.otf'}
os.makedirs(P + '/fonts', exist_ok=True)
for k, f in fonts.items():
    src = '/usr/share/fonts/urw-base35/' + f
    assert os.path.exists(src), f
    shutil.copy(src, P + '/fonts/' + f)
    css = css.replace('url(data:font/otf;base64,' + k + ')', "url(/fonts/" + f + ") format('opentype')")
assert '__' not in css.split('{')[0]
css = css.replace('@font-face{', '@font-face{font-display:swap;')
# retirer ce qui ne servait qu'à la maquette
drop = [r'\.note[^{]*\{[^}]*\}', r'\.label[^{]*\{[^}]*\}', r'\.ghost[^{]*\{[^}]*\}', r'\.b-[\w-]+[^{]*\{[^}]*\}', r'\.c-[\w-]+[^{]*\{[^}]*\}',
        r'\.zoom[^{]*\{[^}]*\}', r'\.dnav[^{]*\{[^}]*\}', r'\.demo[^{]*\{[^}]*\}', r'\.cur\{[^}]*\}']
for d in drop: css = re.sub(d, '', css)
css = re.sub(r'\n\s*\n+', '\n', css)
open(P + '/journal.css', 'w').write(css + open('/data/courrier/tools/extra.css').read())
svg = re.findall(r'<svg[^>]*width="0".*?</svg>', s, re.S)[0]
coffee = re.findall(r'<svg class="coffee.*?</svg>', s, re.S)[0]
tex = re.findall(r'<div class="tex".*?</div>', s, re.S)[0]
verso = re.findall(r'<div class="verso".*?</div>', s, re.S)
verso = verso[0] if verso else ''
import json; svg = re.sub(r'<!--.*?-->', '', svg, flags=re.S); coffee = re.sub(r'<!--.*?-->', '', coffee, flags=re.S)
json.dump({'SVG': svg, 'COFFEE': coffee, 'TEX': tex}, open('/data/courrier/tools/parts.json', 'w'))
print('css', len(css), 'svg', len(svg), 'coffee', len(coffee), 'tex', len(tex), 'verso', len(verso))
