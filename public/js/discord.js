// Le Courrier de la Mare — réglages du message Discord du matin (admin)
const $ = id => document.getElementById(id)
const secret = location.pathname.split('/').filter(Boolean)[1]
const API = '/api/admin/' + encodeURIComponent(decodeURIComponent(secret)) + '/discord'
const TYPES = ['neuves', 'terminees', 'corrigees', 'enCours', 'presque']
let R = null, sale = false

async function api(path = '', opt = {}) {
  const r = await fetch(API + path, { ...opt, headers: { 'content-type': 'application/json' } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || ('Erreur ' + r.status))
  return d
}
const etat = t => { $('ds-etat').textContent = t }
const salir = () => { sale = true; etat('Modifications non enregistrées') }
const hier = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA') }
const quand = ts => { const d = new Date(ts); return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase()) + ', ' + d.getHours() + ' h ' + String(d.getMinutes()).padStart(2, '0') }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function onoff(on) {
  $('ds-on').classList.toggle('on', on); $('ds-off').classList.toggle('on', !on)
}
function journal(j) {
  $('ds-journal').innerHTML = j.length ? j.map(e => esc(quand(e.ts)) + (e.main ? ' (à la main)' : '') + ' · ' +
    (e.statut === 'envoye' ? '<span class="ok">envoyé</span>' : e.statut === 'rien' ? 'rien de neuf, pas de message' : '<span class="ko">échec</span>' + (e.detail ? ' (' + esc(e.detail) + ')' : ''))).join('<br>')
    : 'Rien n’a encore été envoyé.'
}

async function ouvrir() {
  $('vue-liste').classList.add('hide'); $('vue-dsc').classList.remove('hide'); scrollTo(0, 0)
  etat('Chargement…')
  try { R = await api() } catch (e) { etat(e.message); return }
  onoff(!!R.on)
  $('ds-hook').value = ''
  $('ds-hook').placeholder = R.aWebhook ? 'https://discord.com/api/webhooks/••••••••' + R.webhookFin + '  (enregistrée, colle une autre adresse pour la changer)' : 'https://discord.com/api/webhooks/…'
  $('ds-heure').value = String(R.heure ?? 8)
  for (const k of TYPES) $('ds-t-' + k).checked = R.types?.[k] !== false
  $('ds-t-presque').disabled = !$('ds-t-enCours').checked
  journal(R.journal || [])
  $('ds-jour').value = hier()
  $('ds-apercu').textContent = ''; $('ds-apercu').classList.add('hide')
  sale = false; etat('')
}
function fermer() {
  if (sale && !confirm('Quitter sans enregistrer ?')) return
  $('vue-dsc').classList.add('hide'); $('vue-liste').classList.remove('hide')
}
async function enregistrer() {
  const b = { on: $('ds-on').classList.contains('on'), heure: +$('ds-heure').value, types: Object.fromEntries(TYPES.map(k => [k, $('ds-t-' + k).checked])) }
  if ($('ds-hook').value.trim()) b.webhook = $('ds-hook').value.trim()
  if (b.on && !b.webhook && !R.aWebhook) { etat('Colle d’abord l’adresse du webhook.'); return }
  etat('Enregistrement…')
  try { await api('', { method: 'PUT', body: JSON.stringify(b) }); const j = R.journal; R = await api(); R.journal = j; sale = false
    $('ds-hook').value = ''; $('ds-hook').placeholder = 'https://discord.com/api/webhooks/••••••••' + R.webhookFin + '  (enregistrée, colle une autre adresse pour la changer)'
    etat(b.on ? 'Enregistré. Prochain message à ' + b.heure + ' h.' : 'Enregistré. L’envoi est coupé.')
  } catch (e) { etat(e.message) }
}
async function apercu(envoyer) {
  if (sale) { etat('Enregistre d’abord tes réglages.'); return }
  if (envoyer && !confirm('Envoyer ce message dans Discord maintenant ?')) return
  etat(envoyer ? 'Envoi…' : 'Préparation de l’aperçu…')
  try {
    const r = await api(envoyer ? '/envoyer' : '/apercu', { method: 'POST', body: JSON.stringify({ jour: $('ds-jour').value }) })
    $('ds-apercu').classList.remove('hide')
    // l'aperçu ressemble à ce que Discord affichera : gras et liens, sans les signes de mise en forme
    $('ds-apercu').innerHTML = r.apercu ? esc(r.apercu).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[(.+?)\]\(&lt;(.+?)&gt;\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>') : 'Rien de neuf ce jour-là : pas de message.'
    if (envoyer) { journal((await api()).journal || []); etat(r.statut === 'envoye' ? 'Envoyé dans Discord.' : r.statut === 'rien' ? 'Rien à envoyer.' : 'Échec : ' + (r.detail || '')) }
    else etat('')
  } catch (e) { etat(e.message) }
}

$('ds-heure').innerHTML = Array.from({ length: 24 }, (_, h) => '<option value="' + h + '">' + h + ' h</option>').join('')
$('discord').onclick = ouvrir
$('ds-retour').onclick = fermer
$('ds-save').onclick = enregistrer
$('ds-voir').onclick = () => apercu(false)
$('ds-envoyer').onclick = () => apercu(true)
$('ds-on').onclick = () => { onoff(true); salir() }
$('ds-off').onclick = () => { onoff(false); salir() }
for (const id of ['ds-hook', 'ds-heure', ...TYPES.map(k => 'ds-t-' + k)]) $(id).addEventListener('input', salir)
$('ds-t-enCours').addEventListener('change', () => { $('ds-t-presque').disabled = !$('ds-t-enCours').checked })
