# Assemble les pages HTML de public/ à partir des morceaux de la maquette
P = '/data/courrier/public'
import json
parts = json.load(open('/data/courrier/tools/parts.json'))
SVG, COFFEE, TEX = parts['SVG'], parts['COFFEE'], parts['TEX']
VERSO = '<div class="verso" data-verso></div>'

def head(title, extra=''):
    return f'''<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<title>{title}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%232c6a48'/%3E%3Ctext x='16' y='24' font-size='22' font-family='serif' font-weight='700' fill='%23f1ede2' text-anchor='middle'%3EM%3C/text%3E%3C/svg%3E">
<link rel="preload" href="/fonts/NimbusMonoPS-Bold.otf" as="font" type="font/otf" crossorigin>
<link rel="stylesheet" href="/journal.css">{extra}
</head><body>
{SVG}
'''

MAST = '''  <div class="a-top ink"><span><b id="m-date"></b></span><span id="m-num"></span><span>Prix : 42 francs</span></div>
  <header class="a-mast">
    <div class="ear ink"><h5>Le temps du week-end</h5><div class="r"><span>Samedi</span><b id="m-sam">—</b></div><div class="r"><span>Dimanche</span><b id="m-dim">—</b></div><p class="rocket">L'avis de Rocket : bon temps pour rester dedans.</p></div>
    <h1 class="a-title ink">Le Courrier<br>de la Mare</h1>
    <div class="ear ink"><h5>Aujourd'hui</h5><div class="r" id="m-saint-r"><span>On fête</span><b id="m-saint"></b></div><div class="r"><span>Lune</span><b id="m-lune"></b></div><div class="r" id="m-soleil-r"><span>Soleil</span><b id="m-soleil"></b></div></div>
  </header>
  <div class="a-band ink"><span>Édition du dimanche</span><span class="x acc">Toutes les nouvelles, même celles des cailloux</span><span id="m-band"></span></div>
  <div class="a-rule"></div>
'''
OURS = '''  <footer class="ours">
    <p>Directeur de la publication : <b>Rocket</b>. Imprimé par <b>le Canard</b>, sous la direction d'<b>Astra</b>.</p>
    <p class="vagues">N'oubliez pas, lectrices, lecteurs : faites des vagues.</p>
  </footer>
'''

grille = head('Mots croisés — Le Courrier de la Mare') + f'''
<section class="page" id="journal">
  {TEX}
  {VERSO}
{COFFEE}
{MAST}
  <div class="jeu">
    <article class="col-grille">
      <div class="rubhead"><h2 class="rub ink">Mots croisés</h2><span class="etat" id="etat"></span></div>
      <p class="chap" id="chap"></p>
      <div class="defbar" id="defbar">
        <div class="dtxt"><b id="dlabel"></b> <span id="dtext"></span><div class="pat" id="pat"></div></div>
        <div class="mode" role="group" aria-label="Outil"><button id="m-ink" class="on" title="Lettres sûres, vues par tout le monde"><span class="ico-ink">A</span>Machine</button><button id="m-pc" title="Pas sûr : visible par toi seul·e"><span class="ico-pc">a</span>Crayon</button></div>
      </div>
      <div class="vp" id="vp"><div class="g" id="g"></div>
        <div class="tampons" id="tampons"><div class="tampon t1">Tamponné</div><div class="tampon t2">Double<br>tamponné</div></div></div>
      <input id="kb" class="kb" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="next" aria-label="Saisie">
      <div class="sous"><p class="avance" id="avance"></p><span class="aide">Crayon de bois = pas sûr, et toi seul·e le vois. Un mot compte quand il est entièrement à la machine.</span></div>
    </article>
    <aside class="col-side">
      <section class="bloc">
        <h3 class="rub2 ink">Iels sont trop forts</h3>
        <ol class="classement" id="cl"></ol>
        <div class="fil" id="fil"></div>
        <p class="moiici" id="moiici"></p>
      </section>
      <section class="bloc defs">
        <h3 class="rub2 ink">Horizontalement</h3><ol id="lh"></ol>
        <h3 class="rub2 ink">Verticalement</h3><ol id="lv"></ol>
      </section>
    </aside>
  </div>
  <section class="pa" id="pa"><h3 class="rub2 ink">Petites annonces</h3><div class="pa-cols" id="pa-cols"></div></section>
{OURS}
</section>

<div class="voile hide" id="accueil">
  <section class="page carte">
    {TEX}
    <p class="k">Premier passage</p>
    <h2 class="q ink">Comment qu'on t'appelle&nbsp;?</h2>
    <input class="champ" id="nom" maxlength="24" autocomplete="nickname" spellcheck="false">
    <p class="k2">Choisis ta couleur</p>
    <div class="encres" id="encres"></div>
    <button class="btn ink" id="go" disabled>Vindiou&nbsp;!</button>
  </section>
</div>

<div class="hide" id="perdu">
  <section class="page carte solo">
    {TEX}
    <p class="k">Grille introuvable</p>
    <h2 class="q ink">Oh non&nbsp;!</h2>
    <p class="txt">Astra a probablement mangé cette grille.</p>
    <p class="txt">Vous pouvez envoyer un message au canard pour qu'il en retrouve une autre.</p>
  </section>
</div>
<script type="module" src="/js/grille.js"></script>
</body></html>
'''
open(P + '/grille.html', 'w').write(grille)

introuvable = head('Grille introuvable — Le Courrier de la Mare') + f'''
<section class="page carte solo">
  {TEX}
  <p class="k">Grille introuvable</p>
  <h2 class="q ink">Oh non&nbsp;!</h2>
  <p class="txt">Astra a probablement mangé cette grille.</p>
  <p class="txt">Vous pouvez envoyer un message au canard pour qu'il en retrouve une autre.</p>
</section>
</body></html>
'''
open(P + '/introuvable.html', 'w').write(introuvable)

admin = head('La rédaction — Le Courrier de la Mare') + f'''
<section class="page adm">
  {TEX}
  <div class="a-top ink"><span><b>La rédaction</b></span><span>Réservé au personnel</span><span>Prix : 42 francs</span></div>
  <header style="padding:12px 0 10px;text-align:center"><h1 class="a-title ink" style="font-size:clamp(36px,6vw,64px)">Le Courrier de la Mare</h1></header>
  <div class="a-band ink"><span>Salle de rédaction</span><span class="x acc">On fabrique les grilles ici</span><span id="cpt"></span></div>
  <div class="a-rule"></div>

  <div id="vue-liste">
    <div class="outils" style="margin-top:16px"><h2 style="margin:0">Les grilles</h2><span class="etat"></span><button class="pbtn vert" id="nouvelle">Nouvelle grille</button></div>
    <table class="liste"><thead><tr><th>N°</th><th>Date</th><th class="mob">Taille</th><th class="mob">Journal d'origine</th><th>Lien à partager</th><th></th></tr></thead><tbody id="grilles"></tbody></table>
    <p class="msg" id="vide"></p>
  </div>

  <div id="vue-ed" class="hide">
    <div class="outils" style="margin-top:16px"><button class="pbtn" id="retour">← Les grilles</button><h2 style="margin:0 0 0 8px" id="ed-titre">Nouvelle grille</h2></div>

    <p class="k">1. La taille</p>
    <div class="form">
      <label>Lignes<input type="number" id="f-rows" min="3" max="40" value="32"></label>
      <label>Colonnes<input type="number" id="f-cols" min="3" max="40" value="35"></label>
      <label class="l2"><small>Changer la taille garde les cases noires déjà posées en haut à gauche.</small><button class="pbtn" id="f-taille" style="align-self:flex-start">Appliquer la taille</button></label>
    </div>

    <p class="k">2. Les cases noires</p>
    <div class="outils"><span class="msg" style="margin:0">Clique ou glisse sur les cases pour les noircir ou les blanchir.</span><span class="etat" id="ed-compte"></span><button class="pbtn" id="ed-vider">Tout blanchir</button></div>
    <div class="ed-wrap">
      <div class="ed-vp"><div class="g ed" id="ed-g"></div></div>
      <div class="defin">
        <p class="k" style="margin-top:0">3. Les définitions</p>
        <p class="msg">Une ligne par numéro, comme dans le journal. Les définitions d'une même ligne sont séparées par des points : la 1<sup>re</sup> va au 1<sup>er</sup> mot, la 2<sup>e</sup> au 2<sup>e</sup>…</p>
        <h3 class="rub2 ink">Horizontalement</h3>
        <textarea class="zone" id="f-h" spellcheck="false" placeholder="1. Ne se fait pas en un jour. Note.&#10;2. Rongeur."></textarea>
        <div class="verif" id="v-h"></div>
        <h3 class="rub2 ink">Verticalement</h3>
        <textarea class="zone" id="f-v" spellcheck="false"></textarea>
        <div class="verif" id="v-v"></div>
      </div>
    </div>

    <p class="k">4. Le journal du jour</p>
    <div class="form">
      <label class="l2">Journal d'origine<input id="f-source" placeholder="Ouest-France, Le Monde…"></label>
      <label>Date de l'édition<input type="date" id="f-date"></label>
      <label>On fête<input id="f-saint" placeholder="Firmin"></label>
      <label>Météo samedi<input id="f-sam" placeholder="Averses, 11°"></label>
      <label>Météo dimanche<input id="f-dim" placeholder="Éclaircies, 14°"></label>
      <label>Lune<input id="f-lune" placeholder="calculée toute seule"></label>
      <label>Soleil<input id="f-soleil" placeholder="8 h 07 – 19 h 08"></label>
      <label class="l4">Petites annonces<small>Une annonce par ligne. La première phrase s'imprime en gras.</small><textarea id="f-pa" spellcheck="true"></textarea></label>
    </div>

    <div class="barre"><span class="etat" id="ed-etat"></span><a class="pbtn hide" id="ed-voir" target="_blank" rel="noopener">Ouvrir la grille</a><button class="pbtn vert" id="ed-save">Enregistrer</button></div>
  </div>
{OURS}
</section>
<script type="module" src="/js/admin.js"></script>
</body></html>
'''
open(P + '/admin.html', 'w').write(admin)
print('pages ok')
