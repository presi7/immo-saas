import { useEffect, useState, useCallback } from 'react'
import { supabase, fcfa } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import PanneauBien from '../components/PanneauBien'

const TYPES = [
  ['terrain', 'Terrain'],
  ['maison', 'Maison'],
  ['appartement', 'Appartement'],
  ['local_commercial', 'Local commercial'],
  ['bureau', 'Bureau'],
  ['autre', 'Autre'],
]

const OFFRES = [
  ['vente', 'À vendre'],
  ['location', 'À louer'],
  ['les_deux', 'Vente ou location'],
]

const STATUTS = [
  ['disponible', 'Disponible'],
  ['reserve', 'Réservé'],
  ['vendu', 'Vendu'],
  ['loue', 'Loué'],
  ['retire', 'Retiré'],
]

const libelle = (liste, valeur) =>
  liste.find(([v]) => v === valeur)?.[1] ?? valeur

const formulaireVide = {
  title: '', kind: 'terrain', offer: 'vente', status: 'disponible',
  commune: '', quartier: '', surface_m2: '', rooms: '',
  sale_price: '', rent_monthly: '', description: '',
  owner_name: '', owner_phone: '',
}

export default function Biens() {
  const { profil } = useAuth()
  const [biens, setBiens] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [filtre, setFiltre] = useState('tous')
  const [recherche, setRecherche] = useState('')
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [f, setF] = useState(formulaireVide)
  const [envoi, setEnvoi] = useState(false)
  const [bienOuvert, setBienOuvert] = useState(null)

  const charger = useCallback(async () => {
    setChargement(true)
    const { data, error } = await supabase
      .from('properties')
      .select('id, reference, title, kind, offer, status, commune, quartier, surface_m2, sale_price, rent_monthly, owners(full_name)')
      .order('created_at', { ascending: false })
    if (error) setErreur(error.message)
    else { setBiens(data ?? []); setErreur('') }
    setChargement(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  const maj = (champ) => (e) => setF({ ...f, [champ]: e.target.value })

  const nombreOuNull = (v) => (v === '' || v === null ? null : Number(v))

  async function enregistrer(e) {
    e.preventDefault()
    setEnvoi(true)
    setErreur('')
    try {
      let owner_id = null

      // Crée le propriétaire s'il est renseigné et n'existe pas déjà.
      if (f.owner_name.trim()) {
        const { data: existant } = await supabase
          .from('owners').select('id')
          .eq('full_name', f.owner_name.trim())
          .maybeSingle()

        if (existant) owner_id = existant.id
        else {
          const { data: cree, error: eOwner } = await supabase
            .from('owners')
            .insert({
              agency_id: profil.agency_id,
              full_name: f.owner_name.trim(),
              phone: f.owner_phone.trim() || null,
            })
            .select('id').single()
          if (eOwner) throw new Error(eOwner.message)
          owner_id = cree.id
        }
      }

      const { error } = await supabase.from('properties').insert({
        agency_id: profil.agency_id,
        owner_id,
        title: f.title.trim(),
        kind: f.kind,
        offer: f.offer,
        status: f.status,
        commune: f.commune.trim() || null,
        quartier: f.quartier.trim() || null,
        surface_m2: nombreOuNull(f.surface_m2),
        rooms: nombreOuNull(f.rooms),
        sale_price: nombreOuNull(f.sale_price),
        rent_monthly: nombreOuNull(f.rent_monthly),
        description: f.description.trim() || null,
        created_by: profil.id,
      })
      if (error) throw new Error(error.message)

      setF(formulaireVide)
      setFormulaireOuvert(false)
      await charger()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  async function changerStatut(id, status) {
    const { error } = await supabase.from('properties').update({ status }).eq('id', id)
    if (error) setErreur(error.message)
    else setBiens(biens.map(b => (b.id === id ? { ...b, status } : b)))
  }

  const visibles = biens
    .filter(b => filtre === 'tous' || b.status === filtre)
    .filter(b => {
      const q = recherche.trim().toLowerCase()
      if (!q) return true
      return [b.title, b.commune, b.quartier, b.owners?.full_name]
        .filter(Boolean).some(v => v.toLowerCase().includes(q))
    })

  const loue = f.offer === 'location' || f.offer === 'les_deux'
  const vendu = f.offer === 'vente' || f.offer === 'les_deux'

  return (
    <>
      <div className="entete-page rangee">
        <div>
          <h1>Biens</h1>
          <p>{biens.length} bien{biens.length > 1 ? 's' : ''} enregistré{biens.length > 1 ? 's' : ''}</p>
        </div>
        <button className="bouton" onClick={() => setFormulaireOuvert(!formulaireOuvert)}>
          {formulaireOuvert ? 'Annuler' : 'Ajouter un bien'}
        </button>
      </div>

      {erreur && <div className="message-erreur" role="alert">{erreur}</div>}

      {formulaireOuvert && (
        <form className="bloc formulaire" onSubmit={enregistrer}>
          <header><h2>Nouveau bien</h2></header>

          <div className="grille">
            <label className="champ large">
              <span>Intitulé</span>
              <input value={f.title} onChange={maj('title')} required
                     placeholder="Terrain 300 m² Diamniadio extension" />
            </label>

            <label className="champ">
              <span>Type</span>
              <select value={f.kind} onChange={maj('kind')}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>

            <label className="champ">
              <span>Offre</span>
              <select value={f.offer} onChange={maj('offer')}>
                {OFFRES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>

            <label className="champ">
              <span>Commune</span>
              <input value={f.commune} onChange={maj('commune')} placeholder="Diamniadio" />
            </label>

            <label className="champ">
              <span>Quartier</span>
              <input value={f.quartier} onChange={maj('quartier')} />
            </label>

            <label className="champ">
              <span>Superficie (m²)</span>
              <input type="number" min="0" step="0.01"
                     value={f.surface_m2} onChange={maj('surface_m2')} />
            </label>

            <label className="champ">
              <span>Pièces</span>
              <input type="number" min="0" value={f.rooms} onChange={maj('rooms')} />
            </label>

            {vendu && (
              <label className="champ">
                <span>Prix de vente (FCFA)</span>
                <input type="number" min="0" value={f.sale_price} onChange={maj('sale_price')} />
              </label>
            )}

            {loue && (
              <label className="champ">
                <span>Loyer mensuel (FCFA)</span>
                <input type="number" min="0" value={f.rent_monthly} onChange={maj('rent_monthly')} />
              </label>
            )}

            <label className="champ">
              <span>Propriétaire</span>
              <input value={f.owner_name} onChange={maj('owner_name')}
                     placeholder="Nom du propriétaire" />
            </label>

            <label className="champ">
              <span>Téléphone du propriétaire</span>
              <input type="tel" value={f.owner_phone} onChange={maj('owner_phone')} />
            </label>

            <label className="champ large">
              <span>Description</span>
              <textarea rows={3} value={f.description} onChange={maj('description')}
                        placeholder="Accès goudron, titre foncier disponible, proche autoroute…" />
            </label>
          </div>

          <div className="actions">
            <button type="button" className="bouton secondaire"
                    onClick={() => { setFormulaireOuvert(false); setF(formulaireVide) }}>
              Annuler
            </button>
            <button className="bouton" disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Enregistrer le bien'}
            </button>
          </div>
        </form>
      )}

      <div className="filtres">
        <input className="recherche" value={recherche} onChange={e => setRecherche(e.target.value)}
               placeholder="Rechercher un bien, une commune, un propriétaire" />
        <select value={filtre} onChange={e => setFiltre(e.target.value)}>
          <option value="tous">Tous les statuts</option>
          {STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <section className="bloc">
        {chargement ? (
          <p className="vide">Chargement…</p>
        ) : visibles.length === 0 ? (
          <p className="vide">
            {biens.length === 0
              ? "Aucun bien pour l'instant. Ajoute ton premier terrain ou ta première maison."
              : "Aucun bien ne correspond à cette recherche."}
          </p>
        ) : visibles.map(b => (
          <div className="ligne" key={b.id}>
            <div className="cliquable" role="button" tabIndex={0}
                 onClick={() => setBienOuvert(b)}
                 onKeyDown={e => e.key === 'Enter' && setBienOuvert(b)}>
              <div className="principal">{b.title}</div>
              <div className="secondaire">
                {libelle(TYPES, b.kind)}
                {b.commune && ` · ${b.commune}`}
                {b.quartier && `, ${b.quartier}`}
                {b.surface_m2 && ` · ${b.surface_m2} m²`}
                {b.owners?.full_name && ` · ${b.owners.full_name}`}
              </div>
            </div>

            <div className="fin-ligne">
              <div className="montant">
                {b.sale_price ? fcfa(b.sale_price)
                  : b.rent_monthly ? `${fcfa(b.rent_monthly)} / mois`
                  : '—'}
              </div>
              <select className="statut" value={b.status}
                      onChange={e => changerStatut(b.id, e.target.value)}>
                {STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
        ))}
      </section>

      {bienOuvert && (
        <PanneauBien bien={bienOuvert} onFermer={() => setBienOuvert(null)} onMaj={charger} />
      )}
    </>
  )
}