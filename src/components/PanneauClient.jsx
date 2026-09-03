import { useEffect, useState, useCallback } from 'react'
import { supabase, fcfa, dateCourte } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { TYPES_CLIENT, STATUTS_CLIENT, libelle } from '../pages/Clients'

const TYPES_ECHANGE = [
  ['appel', 'Appel'],
  ['whatsapp', 'WhatsApp'],
  ['sms', 'SMS'],
  ['rdv', 'Rendez-vous'],
  ['note', 'Note'],
]

export default function PanneauClient({ client, onFermer, onMaj }) {
  const { profil } = useAuth()
  const [c, setC] = useState(client)
  const [echanges, setEchanges] = useState([])
  const [correspondants, setCorrespondants] = useState([])
  const [typeEchange, setTypeEchange] = useState('appel')
  const [texte, setTexte] = useState('')
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  const charger = useCallback(async () => {
    setChargement(true)

    const { data: e, error: eErr } = await supabase
      .from('client_interactions')
      .select('id, kind, content, occurred_at')
      .eq('client_id', c.id)
      .order('occurred_at', { ascending: false })
      .limit(30)

    if (eErr) setErreur(eErr.message)
    else setEchanges(e ?? [])

    // Biens disponibles compatibles avec la recherche du client.
    let req = supabase
      .from('properties')
      .select('id, title, kind, commune, quartier, sale_price, rent_monthly')
      .eq('status', 'disponible')
      .limit(6)

    if (c.search_kind) req = req.eq('kind', c.search_kind)
    if (c.budget_max) req = req.or(`sale_price.lte.${c.budget_max},sale_price.is.null`)

    const { data: b } = await req
    setCorrespondants(b ?? [])
    setChargement(false)
  }, [c.id, c.search_kind, c.budget_max])

  useEffect(() => { charger() }, [charger])

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
    // Un premier échange fait passer le prospect en cours de traitement.
    if (c.status === 'nouveau') await modifier({ status: 'en_cours' })
    await charger()
  }

  async function modifier(champs) {
    const { error } = await supabase.from('clients').update(champs).eq('id', c.id)
    if (error) { setErreur(error.message); return }
    setC({ ...c, ...champs })
    onMaj?.()
  }

  const lienWhatsapp = () => {
    const numero = (c.whatsapp || c.phone).replace(/[^0-9]/g, '')
    const complet = numero.startsWith('221') ? numero : `221${numero}`
    return `https://wa.me/${complet}`
  }

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
            <a className="bouton secondaire" href={lienWhatsapp()}
               target="_blank" rel="noopener noreferrer">
              Écrire sur WhatsApp
            </a>
          </div>

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

          {(c.search_zone || c.budget_max) && (
            <p className="secondaire recherche-client">
              Recherche : {c.search_kind ? libelle(TYPES_CLIENT, c.search_kind) : 'tout type'}
              {c.search_zone && ` à ${c.search_zone}`}
              {c.budget_max && ` · budget jusqu'à ${fcfa(c.budget_max)}`}
            </p>
          )}

          {c.notes && <p className="secondaire recherche-client">{c.notes}</p>}
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