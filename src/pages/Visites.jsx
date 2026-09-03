import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const STATUTS = [
  ['planifiee', 'Planifiée'],
  ['effectuee', 'Effectuée'],
  ['annulee', 'Annulée'],
  ['reportee', 'Reportée'],
]

const libelle = (liste, v) => liste.find(([x]) => x === v)?.[1] ?? v

/** Date et heure lisibles : « ven. 04 sept. à 15:30 ». */
function quand(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const jour = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short',
  }).format(d)
  const heure = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit', minute: '2-digit',
  }).format(d)
  return `${jour} à ${heure}`
}

/** Valeur par défaut du champ datetime-local : demain 10h. */
function demainMatin() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function Visites() {
  const { profil } = useAuth()
  const [visites, setVisites] = useState([])
  const [biens, setBiens] = useState([])
  const [clients, setClients] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [onglet, setOnglet] = useState('a_venir')
  const [ouvert, setOuvert] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [retourOuvert, setRetourOuvert] = useState(null)
  const [retour, setRetour] = useState({ feedback: '', interest_level: '3' })

  const [f, setF] = useState({
    property_id: '', client_id: '', scheduled_at: demainMatin(),
  })

  const charger = useCallback(async () => {
    setChargement(true)
    const [v, b, c] = await Promise.all([
      supabase.from('visits')
        .select('id, scheduled_at, status, feedback, interest_level, properties(id, title, commune), clients(id, full_name, phone, whatsapp)')
        .order('scheduled_at', { ascending: false }),
      supabase.from('properties')
        .select('id, title, commune')
        .in('status', ['disponible', 'reserve'])
        .order('created_at', { ascending: false }),
      supabase.from('clients')
        .select('id, full_name, phone, whatsapp')
        .order('full_name'),
    ])

    const souci = [v, b, c].find(r => r.error)
    if (souci) setErreur(souci.error.message)
    else setErreur('')

    setVisites(v.data ?? [])
    setBiens(b.data ?? [])
    setClients(c.data ?? [])
    setChargement(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  const maj = (champ) => (e) => setF({ ...f, [champ]: e.target.value })

  async function planifier(e) {
    e.preventDefault()
    setEnvoi(true); setErreur('')
    try {
      const { error } = await supabase.from('visits').insert({
        agency_id: profil.agency_id,
        property_id: f.property_id,
        client_id: f.client_id,
        agent_id: profil.id,
        scheduled_at: new Date(f.scheduled_at).toISOString(),
        status: 'planifiee',
      })
      if (error) throw new Error(error.message)

      setF({ property_id: '', client_id: '', scheduled_at: demainMatin() })
      setOuvert(false)
      await charger()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  async function changerStatut(v, status) {
    if (status === 'effectuee') {
      setRetourOuvert(v.id)
      setRetour({ feedback: '', interest_level: '3' })
      return
    }
    const { error } = await supabase.from('visits').update({ status }).eq('id', v.id)
    if (error) setErreur(error.message)
    else await charger()
  }

  async function enregistrerRetour(v) {
    const { error } = await supabase.from('visits').update({
      status: 'effectuee',
      feedback: retour.feedback.trim() || null,
      interest_level: Number(retour.interest_level),
    }).eq('id', v.id)

    if (error) { setErreur(error.message); return }

    // Le retour de visite alimente aussi l'historique du client.
    if (retour.feedback.trim()) {
      await supabase.from('client_interactions').insert({
        agency_id: profil.agency_id,
        client_id: v.clients.id,
        kind: 'visite',
        content: `Visite de ${v.properties.title} — ${retour.feedback.trim()}`,
        created_by: profil.id,
      })
    }

    setRetourOuvert(null)
    await charger()
  }

  function lienWhatsapp(v) {
    const brut = (v.clients?.whatsapp || v.clients?.phone || '').replace(/[^0-9]/g, '')
    const numero = brut.startsWith('221') ? brut : `221${brut}`
    const texte = encodeURIComponent(
      `Bonjour ${v.clients?.full_name}, je vous confirme la visite de « ${v.properties?.title} » ${quand(v.scheduled_at)}. À bientôt.`
    )
    return `https://wa.me/${numero}?text=${texte}`
  }

  const maintenant = new Date().toISOString()

  const visibles = visites.filter(v => {
    if (onglet === 'a_venir') return v.status === 'planifiee' && v.scheduled_at >= maintenant
    if (onglet === 'a_traiter') return v.status === 'planifiee' && v.scheduled_at < maintenant
    return v.status === 'effectuee' || v.status === 'annulee' || v.status === 'reportee'
  })

  const aTraiter = visites.filter(
    v => v.status === 'planifiee' && v.scheduled_at < maintenant
  ).length

  const manqueDonnees = biens.length === 0 || clients.length === 0

  return (
    <>
      <div className="entete-page rangee">
        <div>
          <h1>Visites</h1>
          <p>
            {visites.length} visite{visites.length > 1 ? 's' : ''}
            {aTraiter > 0 && ` · ${aTraiter} en attente de retour`}
          </p>
        </div>
        <button className="bouton" onClick={() => setOuvert(!ouvert)} disabled={manqueDonnees}>
          {ouvert ? 'Annuler' : 'Planifier une visite'}
        </button>
      </div>

      {erreur && <div className="message-erreur" role="alert">{erreur}</div>}

      {manqueDonnees && (
        <div className="message-info">
          Pour planifier une visite, il faut au moins un bien disponible et un client enregistré.
        </div>
      )}

      {ouvert && (
        <form className="bloc formulaire" onSubmit={planifier}>
          <header><h2>Nouvelle visite</h2></header>

          <div className="grille">
            <label className="champ">
              <span>Bien à visiter</span>
              <select value={f.property_id} onChange={maj('property_id')} required>
                <option value="">Choisir un bien</option>
                {biens.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.title}{b.commune ? ` — ${b.commune}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="champ">
              <span>Client</span>
              <select value={f.client_id} onChange={maj('client_id')} required>
                <option value="">Choisir un client</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name} — {c.phone}</option>
                ))}
              </select>
            </label>

            <label className="champ">
              <span>Date et heure</span>
              <input type="datetime-local" value={f.scheduled_at}
                     onChange={maj('scheduled_at')} required />
            </label>
          </div>

          <div className="actions">
            <button type="button" className="bouton secondaire" onClick={() => setOuvert(false)}>
              Annuler
            </button>
            <button className="bouton" disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Planifier'}
            </button>
          </div>
        </form>
      )}

      <div className="onglets">
        <button className={onglet === 'a_venir' ? 'actif' : ''}
                onClick={() => setOnglet('a_venir')}>À venir</button>
        <button className={onglet === 'a_traiter' ? 'actif' : ''}
                onClick={() => setOnglet('a_traiter')}>
          En attente de retour{aTraiter > 0 && ` (${aTraiter})`}
        </button>
        <button className={onglet === 'passees' ? 'actif' : ''}
                onClick={() => setOnglet('passees')}>Terminées</button>
      </div>

      <section className="bloc">
        {chargement ? (
          <p className="vide">Chargement…</p>
        ) : visibles.length === 0 ? (
          <p className="vide">
            {onglet === 'a_venir' ? 'Aucune visite programmée.'
              : onglet === 'a_traiter' ? 'Rien en attente. Tous les retours sont saisis.'
              : 'Aucune visite terminée pour le moment.'}
          </p>
        ) : visibles.map(v => (
          <div key={v.id}>
            <div className="ligne">
              <div>
                <div className="principal">{v.clients?.full_name}</div>
                <div className="secondaire">
                  {v.properties?.title}
                  {v.properties?.commune && ` · ${v.properties.commune}`}
                </div>
                <div className="secondaire">{quand(v.scheduled_at)}</div>
                {v.feedback && (
                  <div className="secondaire retour-visite">
                    {'★'.repeat(v.interest_level ?? 0)}{'☆'.repeat(5 - (v.interest_level ?? 0))} · {v.feedback}
                  </div>
                )}
              </div>

              <div className="fin-ligne">
                {v.status === 'planifiee' && (
                  <a className="bouton secondaire" href={lienWhatsapp(v)}
                     target="_blank" rel="noopener noreferrer">Rappeler</a>
                )}
                <select className="statut" value={v.status}
                        onChange={e => changerStatut(v, e.target.value)}>
                  {STATUTS.map(([x, l]) => <option key={x} value={x}>{l}</option>)}
                </select>
              </div>
            </div>

            {retourOuvert === v.id && (
              <div className="retour-formulaire">
                <label className="champ">
                  <span>Retour du client</span>
                  <textarea rows={2} value={retour.feedback}
                            onChange={e => setRetour({ ...retour, feedback: e.target.value })}
                            placeholder="Aime l'emplacement, trouve le prix élevé, veut revenir avec sa femme…" />
                </label>

                <label className="champ">
                  <span>Niveau d'intérêt</span>
                  <select value={retour.interest_level}
                          onChange={e => setRetour({ ...retour, interest_level: e.target.value })}>
                    <option value="1">1 — pas intéressé</option>
                    <option value="2">2 — tiède</option>
                    <option value="3">3 — à suivre</option>
                    <option value="4">4 — très intéressé</option>
                    <option value="5">5 — prêt à conclure</option>
                  </select>
                </label>

                <div className="actions">
                  <button className="bouton secondaire" onClick={() => setRetourOuvert(null)}>
                    Annuler
                  </button>
                  <button className="bouton" onClick={() => enregistrerRetour(v)}>
                    Enregistrer le retour
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </>
  )
}