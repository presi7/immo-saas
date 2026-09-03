import { useEffect, useState, useCallback } from 'react'
import { supabase, fcfa, dateCourte } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { TYPES_CLIENT, STATUTS_CLIENT, TYPES_BIEN, libelle } from '../pages/Clients'

const TYPES_ECHANGE = [
  ['appel', 'Appel'],
  ['whatsapp', 'WhatsApp'],
  ['sms', 'SMS'],
  ['visite', 'Visite'],
  ['rdv', 'Rendez-vous'],
  ['note', 'Note'],
]

const versTexte = (v) => (v === null || v === undefined ? '' : String(v))

export default function PanneauClient({ client, onFermer, onMaj }) {
  const { profil } = useAuth()
  const [c, setC] = useState(client)
  const [modeEdition, setModeEdition] = useState(false)
  const [f, setF] = useState(null)
  const [echanges, setEchanges] = useState([])
  const [correspondants, setCorrespondants] = useState([])
  const [typeEchange, setTypeEchange] = useState('appel')
  const [texte, setTexte] = useState('')
  const [chargement, setChargement] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')

  const charger = useCallback(async () => {
    setChargement(true)

    const { data: fiche } = await supabase
      .from('clients').select('*').eq('id', c.id).maybeSingle()
    if (fiche) setC(fiche)

    const { data: e, error: eErr } = await supabase
      .from('client_interactions')
      .select('id, kind, content, occurred_at')
      .eq('client_id', c.id)
      .order('occurred_at', { ascending: false })
      .limit(30)

    if (eErr) setErreur(eErr.message)
    else setEchanges(e ?? [])

    // Biens disponibles compatibles avec la recherche du client.
    const cible = fiche ?? c
    let req = supabase
      .from('properties')
      .select('id, title, kind, commune, quartier, sale_price, rent_monthly')
      .eq('status', 'disponible')
      .limit(6)

    if (cible.search_kind) req = req.eq('kind', cible.search_kind)
    if (cible.budget_max) req = req.or(`sale_price.lte.${cible.budget_max},sale_price.is.null`)

    const { data: b } = await req
    setCorrespondants(b ?? [])
    setChargement(false)
  }, [c.id])

  useEffect(() => { charger() }, [charger])

  function ouvrirEdition() {
    setF({
      full_name: versTexte(c.full_name),
      phone: versTexte(c.phone),
      whatsapp: versTexte(c.whatsapp),
      email: versTexte(c.email),
      kind: c.kind ?? 'acheteur',
      search_kind: versTexte(c.search_kind),
      search_zone: versTexte(c.search_zone),
      budget_min: versTexte(c.budget_min),
      budget_max: versTexte(c.budget_max),
      source: versTexte(c.source),
      notes: versTexte(c.notes),
    })
    setModeEdition(true)
    setErreur('')
  }

  const majF = (champ) => (e) => setF({ ...f, [champ]: e.target.value })
  const nb = (v) => (v === '' ? null : Number(v))
  const txt = (v) => (v.trim() === '' ? null : v.trim())

  async function enregistrerFiche(e) {
    e.preventDefault()
    setEnvoi(true); setErreur('')
    try {
      const { error } = await supabase.from('clients').update({
        full_name: f.full_name.trim(),
        phone: f.phone.trim(),
        whatsapp: txt(f.whatsapp) ?? f.phone.trim(),
        email: txt(f.email),
        kind: f.kind,
        search_kind: f.search_kind || null,
        search_zone: txt(f.search_zone),
        budget_min: nb(f.budget_min),
        budget_max: nb(f.budget_max),
        source: txt(f.source),
        notes: txt(f.notes),
      }).eq('id', c.id)

      if (error) throw new Error(error.message)

      setModeEdition(false)
      await charger()
      onMaj?.()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  async function supprimerClient() {
    const confirmation = prompt(
      "Cette action est définitive et supprimera aussi l'historique des échanges.\n\nPour confirmer, tape : SUPPRIMER"
    )
    if (confirmation !== 'SUPPRIMER') return

    setEnvoi(true); setErreur('')
    const { error } = await supabase.from('clients').delete().eq('id', c.id)

    if (error) {
      // La base refuse si le client est lié à une transaction.
      setErreur(
        error.code === '23503'
          ? "Ce client est rattaché à une transaction. Passe-le plutôt en statut « Perdu »."
          : error.message
      )
      setEnvoi(false)
      return
    }

    onMaj?.()
    onFermer()
  }

  async function ajouterEchange(e) {
    e.preventDefault()
    if (!texte.trim()) return
    setErreur('')

    const { error } = await supabase.from('client_interactions').insert({
      agency_id: profil.agency_id,
      client_id: c.id,
      kind: typeEchange,
      content: texte.trim(),
      created_by: profil.id,
    })

    if (error) { setErreur(error.message); return }

    setTexte('')
    if (c.status === 'nouveau') await modifier({ status: 'en_cours' })
    await charger()
  }

  async function supprimerEchange(id) {
    if (!confirm('Supprimer cette note ?')) return
    const { error } = await supabase.from('client_interactions').delete().eq('id', id)
    if (error) setErreur(error.message)
    else await charger()
  }

  async function modifier(champs) {
    const { error } = await supabase.from('clients').update(champs).eq('id', c.id)
    if (error) { setErreur(error.message); return }
    setC({ ...c, ...champs })
    onMaj?.()
  }

  const lienWhatsapp = () => {
    const brut = (c.whatsapp || c.phone).replace(/[^0-9]/g, '')
    const numero = brut.startsWith('221') ? brut : `221${brut}`
    return `https://wa.me/${numero}`
  }

  const chercheur = f && (f.kind === 'acheteur' || f.kind === 'locataire')

  return (
    <>
      <div className="voile" onClick={onFermer} />

      <aside className="panneau" role="dialog" aria-label={`Fiche de ${c.full_name}`}>
        <header className="panneau-entete">
          <div>
            <h2>{c.full_name}</h2>
            <p className="secondaire">
              {libelle(TYPES_CLIENT, c.kind)} · {c.phone}
              {c.source && ` · ${c.source}`}
            </p>
          </div>
          <button className="bouton secondaire" onClick={onFermer}>Fermer</button>
        </header>

        {erreur && <div className="message-erreur" role="alert">{erreur}</div>}

        <section className="panneau-section">
          <div className="rangee-titre">
            <h3>Suivi</h3>
            {!modeEdition && (
              <div className="fin-ligne">
                <button className="bouton secondaire" onClick={ouvrirEdition}>Modifier</button>
                <a className="bouton secondaire" href={lienWhatsapp()}
                   target="_blank" rel="noopener noreferrer">WhatsApp</a>
              </div>
            )}
          </div>

          {!modeEdition ? (
            <>
              <div className="grille-suivi">
                <label className="champ">
                  <span>Statut</span>
                  <select value={c.status} onChange={e => modifier({ status: e.target.value })}>
                    {STATUTS_CLIENT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>

                <label className="champ">
                  <span>Relancer le</span>
                  <input type="date" value={c.next_followup ?? ''}
                         onChange={e => modifier({ next_followup: e.target.value || null })} />
                </label>
              </div>

              <dl className="fiche">
                {c.email && <div><dt>Email</dt><dd>{c.email}</dd></div>}
                {c.whatsapp && c.whatsapp !== c.phone && (
                  <div><dt>WhatsApp</dt><dd>{c.whatsapp}</dd></div>
                )}
                {c.search_kind && (
                  <div><dt>Cherche</dt><dd>{libelle(TYPES_BIEN, c.search_kind)}</dd></div>
                )}
                {c.search_zone && <div><dt>Zone</dt><dd>{c.search_zone}</dd></div>}
                {c.budget_max && (
                  <div><dt>Budget</dt>
                    <dd className="montant">
                      {c.budget_min ? `${fcfa(c.budget_min)} – ` : "jusqu'à "}{fcfa(c.budget_max)}
                    </dd></div>
                )}
              </dl>

              {c.notes && <p className="secondaire recherche-client">{c.notes}</p>}

              <button className="lien-nu danger bloc-danger"
                      onClick={supprimerClient} disabled={envoi}>
                Supprimer ce client
              </button>
            </>
          ) : (
            <form onSubmit={enregistrerFiche}>
              <div className="grille-suivi">
                <label className="champ large">
                  <span>Nom complet</span>
                  <input value={f.full_name} onChange={majF('full_name')} required />
                </label>

                <label className="champ">
                  <span>Téléphone</span>
                  <input type="tel" value={f.phone} onChange={majF('phone')} required />
                </label>

                <label className="champ">
                  <span>WhatsApp <em className="indice">si différent</em></span>
                  <input type="tel" value={f.whatsapp} onChange={majF('whatsapp')} />
                </label>

                <label className="champ">
                  <span>Email</span>
                  <input type="email" value={f.email} onChange={majF('email')} />
                </label>

                <label className="champ">
                  <span>Profil</span>
                  <select value={f.kind} onChange={majF('kind')}>
                    {TYPES_CLIENT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>

                {chercheur && (
                  <>
                    <label className="champ">
                      <span>Cherche un</span>
                      <select value={f.search_kind} onChange={majF('search_kind')}>
                        <option value="">Peu importe</option>
                        {TYPES_BIEN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </label>

                    <label className="champ">
                      <span>Zone souhaitée</span>
                      <input value={f.search_zone} onChange={majF('search_zone')} />
                    </label>

                    <label className="champ">
                      <span>Budget minimum</span>
                      <input type="number" min="0" value={f.budget_min}
                             onChange={majF('budget_min')} />
                    </label>

                    <label className="champ">
                      <span>Budget maximum</span>
                      <input type="number" min="0" value={f.budget_max}
                             onChange={majF('budget_max')} />
                    </label>
                  </>
                )}

                <label className="champ">
                  <span>Provenance</span>
                  <input value={f.source} onChange={majF('source')} />
                </label>

                <label className="champ large">
                  <span>Notes</span>
                  <textarea rows={2} value={f.notes} onChange={majF('notes')} />
                </label>
              </div>

              <div className="actions">
                <button type="button" className="bouton secondaire"
                        onClick={() => setModeEdition(false)}>
                  Annuler
                </button>
                <button className="bouton" disabled={envoi}>
                  {envoi ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="panneau-section">
          <h3>Échanges</h3>

          <form className="ajout-echange" onSubmit={ajouterEchange}>
            <select value={typeEchange} onChange={e => setTypeEchange(e.target.value)}>
              {TYPES_ECHANGE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input value={texte} onChange={e => setTexte(e.target.value)}
                   placeholder="Ce qui a été dit…" />
            <button className="bouton" disabled={!texte.trim()}>Noter</button>
          </form>

          {chargement ? (
            <p className="vide">Chargement…</p>
          ) : echanges.length === 0 ? (
            <p className="vide">Aucun échange noté. Garde une trace de chaque appel.</p>
          ) : echanges.map(e => (
            <div className="ligne" key={e.id}>
              <div>
                <div className="principal">{e.content}</div>
                <div className="secondaire">
                  {libelle(TYPES_ECHANGE, e.kind)} · {dateCourte(e.occurred_at)}
                </div>
              </div>
              <button className="lien-nu danger" onClick={() => supprimerEchange(e.id)}>
                Supprimer
              </button>
            </div>
          ))}
        </section>

        <section className="panneau-section">
          <h3>Biens qui pourraient lui convenir</h3>

          {correspondants.length === 0 ? (
            <p className="vide">Aucun bien disponible ne correspond à sa recherche.</p>
          ) : correspondants.map(b => (
            <div className="ligne" key={b.id}>
              <div>
                <div className="principal">{b.title}</div>
                <div className="secondaire">
                  {b.commune}{b.quartier ? `, ${b.quartier}` : ''}
                </div>
              </div>
              <div className="montant">
                {b.sale_price ? fcfa(b.sale_price)
                  : b.rent_monthly ? `${fcfa(b.rent_monthly)} / mois` : '—'}
              </div>
            </div>
          ))}
        </section>
      </aside>
    </>
  )
}