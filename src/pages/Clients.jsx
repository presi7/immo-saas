import { useEffect, useState, useCallback } from 'react'
import { supabase, fcfa, dateCourte } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import PanneauClient from '../components/PanneauClient'

export const TYPES_CLIENT = [
  ['acheteur', 'Acheteur'],
  ['locataire', 'Locataire'],
  ['vendeur', 'Vendeur'],
  ['bailleur', 'Bailleur'],
]

export const STATUTS_CLIENT = [
  ['nouveau', 'Nouveau'],
  ['en_cours', 'En cours'],
  ['converti', 'Converti'],
  ['perdu', 'Perdu'],
]

export const TYPES_BIEN = [
  ['terrain', 'Terrain'],
  ['maison', 'Maison'],
  ['appartement', 'Appartement'],
  ['local_commercial', 'Local commercial'],
  ['bureau', 'Bureau'],
  ['autre', 'Autre'],
]

export const libelle = (liste, valeur) =>
  liste.find(([v]) => v === valeur)?.[1] ?? valeur

const formulaireVide = {
  full_name: '', phone: '', whatsapp: '', email: '',
  kind: 'acheteur', status: 'nouveau',
  search_kind: '', search_zone: '', budget_min: '', budget_max: '',
  source: '', next_followup: '', notes: '',
}

export default function Clients() {
  const { profil } = useAuth()
  const [clients, setClients] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [filtre, setFiltre] = useState('actifs')
  const [recherche, setRecherche] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [f, setF] = useState(formulaireVide)
  const [envoi, setEnvoi] = useState(false)
  const [clientOuvert, setClientOuvert] = useState(null)

  const charger = useCallback(async () => {
    setChargement(true)
    const { data, error } = await supabase
      .from('clients')
      .select('id, full_name, phone, whatsapp, email, kind, status, search_kind, search_zone, budget_min, budget_max, source, next_followup, notes, created_at')
      .order('created_at', { ascending: false })
    if (error) setErreur(error.message)
    else { setClients(data ?? []); setErreur('') }
    setChargement(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  const maj = (champ) => (e) => setF({ ...f, [champ]: e.target.value })
  const nombreOuNull = (v) => (v === '' ? null : Number(v))
  const texteOuNull = (v) => (v.trim() === '' ? null : v.trim())

  async function enregistrer(e) {
    e.preventDefault()
    setEnvoi(true); setErreur('')
    try {
      const { error } = await supabase.from('clients').insert({
        agency_id: profil.agency_id,
        full_name: f.full_name.trim(),
        phone: f.phone.trim(),
        whatsapp: texteOuNull(f.whatsapp) ?? f.phone.trim(),
        email: texteOuNull(f.email),
        kind: f.kind,
        status: f.status,
        search_kind: f.search_kind || null,
        search_zone: texteOuNull(f.search_zone),
        budget_min: nombreOuNull(f.budget_min),
        budget_max: nombreOuNull(f.budget_max),
        source: texteOuNull(f.source),
        next_followup: f.next_followup || null,
        notes: texteOuNull(f.notes),
        assigned_to: profil.id,
      })
      if (error) throw new Error(error.message)
      setF(formulaireVide)
      setOuvert(false)
      await charger()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  const aujourdhui = new Date().toISOString().slice(0, 10)

  const visibles = clients
    .filter(c => {
      if (filtre === 'tous') return true
      if (filtre === 'actifs') return c.status === 'nouveau' || c.status === 'en_cours'
      if (filtre === 'a_relancer') return c.next_followup && c.next_followup <= aujourdhui
      return c.status === filtre
    })
    .filter(c => {
      const q = recherche.trim().toLowerCase()
      if (!q) return true
      return [c.full_name, c.phone, c.search_zone]
        .filter(Boolean).some(v => v.toLowerCase().includes(q))
    })

  const aRelancer = clients.filter(c => c.next_followup && c.next_followup <= aujourdhui).length

  const chercheur = f.kind === 'acheteur' || f.kind === 'locataire'

  return (
    <>
      <div className="entete-page rangee">
        <div>
          <h1>Clients</h1>
          <p>
            {clients.length} client{clients.length > 1 ? 's' : ''}
            {aRelancer > 0 && ` · ${aRelancer} à relancer`}
          </p>
        </div>
        <button className="bouton" onClick={() => setOuvert(!ouvert)}>
          {ouvert ? 'Annuler' : 'Ajouter un client'}
        </button>
      </div>

      {erreur && <div className="message-erreur" role="alert">{erreur}</div>}

      {ouvert && (
        <form className="bloc formulaire" onSubmit={enregistrer}>
          <header><h2>Nouveau client</h2></header>

          <div className="grille">
            <label className="champ">
              <span>Nom complet</span>
              <input value={f.full_name} onChange={maj('full_name')} required
                     placeholder="Aminata Fall" />
            </label>

            <label className="champ">
              <span>Téléphone</span>
              <input type="tel" value={f.phone} onChange={maj('phone')} required
                     placeholder="77 000 00 00" />
            </label>

            <label className="champ">
              <span>WhatsApp <em className="indice">si différent</em></span>
              <input type="tel" value={f.whatsapp} onChange={maj('whatsapp')} />
            </label>

            <label className="champ">
              <span>Email</span>
              <input type="email" value={f.email} onChange={maj('email')} />
            </label>

            <label className="champ">
              <span>Profil</span>
              <select value={f.kind} onChange={maj('kind')}>
                {TYPES_CLIENT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>

            <label className="champ">
              <span>Statut</span>
              <select value={f.status} onChange={maj('status')}>
                {STATUTS_CLIENT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>

            {chercheur && (
              <>
                <label className="champ">
                  <span>Cherche un</span>
                  <select value={f.search_kind} onChange={maj('search_kind')}>
                    <option value="">Peu importe</option>
                    {TYPES_BIEN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>

                <label className="champ">
                  <span>Zone souhaitée</span>
                  <input value={f.search_zone} onChange={maj('search_zone')}
                         placeholder="Diamniadio, Pout…" />
                </label>

                <label className="champ">
                  <span>Budget minimum (FCFA)</span>
                  <input type="number" min="0" value={f.budget_min} onChange={maj('budget_min')} />
                </label>

                <label className="champ">
                  <span>Budget maximum (FCFA)</span>
                  <input type="number" min="0" value={f.budget_max} onChange={maj('budget_max')} />
                </label>
              </>
            )}

            <label className="champ">
              <span>Provenance</span>
              <input value={f.source} onChange={maj('source')}
                     placeholder="Bouche-à-oreille, Facebook, démarcheur…" />
            </label>

            <label className="champ">
              <span>Relancer le</span>
              <input type="date" value={f.next_followup} onChange={maj('next_followup')} />
            </label>

            <label className="champ large">
              <span>Notes</span>
              <textarea rows={2} value={f.notes} onChange={maj('notes')}
                        placeholder="Paie comptant, disponible les week-ends…" />
            </label>
          </div>

          <div className="actions">
            <button type="button" className="bouton secondaire"
                    onClick={() => { setOuvert(false); setF(formulaireVide) }}>
              Annuler
            </button>
            <button className="bouton" disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Enregistrer le client'}
            </button>
          </div>
        </form>
      )}

      <div className="filtres">
        <input className="recherche" value={recherche} onChange={e => setRecherche(e.target.value)}
               placeholder="Rechercher un nom, un téléphone, une zone" />
        <select value={filtre} onChange={e => setFiltre(e.target.value)}>
          <option value="actifs">Clients actifs</option>
          <option value="a_relancer">À relancer</option>
          <option value="tous">Tous</option>
          {STATUTS_CLIENT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <section className="bloc">
        {chargement ? (
          <p className="vide">Chargement…</p>
        ) : visibles.length === 0 ? (
          <p className="vide">
            {clients.length === 0
              ? "Aucun client pour l'instant. Enregistre ton premier prospect."
              : "Aucun client ne correspond à cette sélection."}
          </p>
        ) : visibles.map(c => {
          const enRetard = c.next_followup && c.next_followup <= aujourdhui
          return (
            <div className="ligne" key={c.id}>
              <div className="cliquable" role="button" tabIndex={0}
                   onClick={() => setClientOuvert(c)}
                   onKeyDown={e => e.key === 'Enter' && setClientOuvert(c)}>
                <div className="principal">{c.full_name}</div>
                <div className="secondaire">
                  {libelle(TYPES_CLIENT, c.kind)} · {c.phone}
                  {c.search_zone && ` · cherche à ${c.search_zone}`}
                  {c.budget_max && ` · jusqu'à ${fcfa(c.budget_max)}`}
                </div>
              </div>

              <div className="fin-ligne">
                {enRetard && <span className="etiquette retard">À relancer</span>}
                {!enRetard && c.next_followup && (
                  <span className="secondaire">{dateCourte(c.next_followup)}</span>
                )}
                <span className="etiquette">{libelle(STATUTS_CLIENT, c.status)}</span>
              </div>
            </div>
          )
        })}
      </section>

      {clientOuvert && (
        <PanneauClient
          client={clientOuvert}
          onFermer={() => setClientOuvert(null)}
          onMaj={async () => { await charger() }}
        />
      )}
    </>
  )
}