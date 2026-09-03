import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

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

const TYPES_DOC = [
  ['titre_foncier', 'Titre foncier'],
  ['bail', 'Bail'],
  ['deliberation', 'Délibération'],
  ['plan', 'Plan'],
  ['acte_vente', 'Acte de vente'],
  ['piece_identite', "Pièce d'identité"],
  ['autre', 'Autre'],
]

const MAX_MO = 5

/** Nettoie un nom de fichier : Supabase Storage refuse accents et espaces. */
function nomSur(nom) {
  return nom
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .toLowerCase()
}

const versTexte = (v) => (v === null || v === undefined ? '' : String(v))

export default function PanneauBien({ bien, onFermer, onMaj }) {
  const { profil } = useAuth()
  const [b, setB] = useState(bien)
  const [modeEdition, setModeEdition] = useState(false)
  const [f, setF] = useState(null)
  const [photos, setPhotos] = useState([])
  const [documents, setDocuments] = useState([])
  const [apercus, setApercus] = useState({})
  const [typeDoc, setTypeDoc] = useState('titre_foncier')
  const [chargement, setChargement] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')

  const dossier = `${profil.agency_id}/${b.id}`

  const charger = useCallback(async () => {
    setChargement(true)

    // Recharge la fiche complète : la liste ne rapporte qu'une partie des champs.
    const { data: fiche } = await supabase
      .from('properties')
      .select('*, owners(id, full_name, phone)')
      .eq('id', b.id).maybeSingle()
    if (fiche) setB(fiche)

    const [p, d] = await Promise.all([
      supabase.from('property_photos')
        .select('id, storage_path, is_cover, position')
        .eq('property_id', b.id).order('position'),
      supabase.from('property_documents')
        .select('id, kind, label, storage_path, created_at')
        .eq('property_id', b.id).order('created_at'),
    ])

    if (p.error || d.error) {
      setErreur((p.error || d.error).message)
      setChargement(false)
      return
    }

    setPhotos(p.data ?? [])
    setDocuments(d.data ?? [])

    const chemins = (p.data ?? []).map(x => x.storage_path)
    if (chemins.length) {
      const { data: urls } = await supabase.storage
        .from('properties').createSignedUrls(chemins, 3600)
      const table = {}
      ;(urls ?? []).forEach(u => { if (u.signedUrl) table[u.path] = u.signedUrl })
      setApercus(table)
    } else {
      setApercus({})
    }

    setChargement(false)
  }, [b.id])

  useEffect(() => { charger() }, [charger])

  function ouvrirEdition() {
    setF({
      title: versTexte(b.title),
      kind: b.kind ?? 'terrain',
      offer: b.offer ?? 'vente',
      status: b.status ?? 'disponible',
      commune: versTexte(b.commune),
      quartier: versTexte(b.quartier),
      surface_m2: versTexte(b.surface_m2),
      rooms: versTexte(b.rooms),
      sale_price: versTexte(b.sale_price),
      rent_monthly: versTexte(b.rent_monthly),
      description: versTexte(b.description),
      owner_name: versTexte(b.owners?.full_name),
      owner_phone: versTexte(b.owners?.phone),
    })
    setModeEdition(true)
    setErreur('')
  }

  const maj = (champ) => (e) => setF({ ...f, [champ]: e.target.value })
  const nb = (v) => (v === '' ? null : Number(v))
  const txt = (v) => (v.trim() === '' ? null : v.trim())

  async function enregistrerFiche(e) {
    e.preventDefault()
    setEnvoi(true); setErreur('')
    try {
      let owner_id = b.owner_id ?? null

      if (f.owner_name.trim()) {
        if (b.owners && b.owners.full_name === f.owner_name.trim()) {
          // Même propriétaire : on met simplement son téléphone à jour.
          await supabase.from('owners')
            .update({ phone: txt(f.owner_phone) })
            .eq('id', b.owners.id)
        } else {
          const { data: existant } = await supabase
            .from('owners').select('id')
            .eq('full_name', f.owner_name.trim()).maybeSingle()

          if (existant) owner_id = existant.id
          else {
            const { data: cree, error: eOwner } = await supabase
              .from('owners')
              .insert({
                agency_id: profil.agency_id,
                full_name: f.owner_name.trim(),
                phone: txt(f.owner_phone),
              })
              .select('id').single()
            if (eOwner) throw new Error(eOwner.message)
            owner_id = cree.id
          }
        }
      } else {
        owner_id = null
      }

      const { error } = await supabase.from('properties').update({
        title: f.title.trim(),
        kind: f.kind,
        offer: f.offer,
        status: f.status,
        commune: txt(f.commune),
        quartier: txt(f.quartier),
        surface_m2: nb(f.surface_m2),
        rooms: nb(f.rooms),
        sale_price: nb(f.sale_price),
        rent_monthly: nb(f.rent_monthly),
        description: txt(f.description),
        owner_id,
      }).eq('id', b.id)

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

  async function supprimerBien() {
    const confirmation = prompt(
      "Cette action est définitive et supprimera aussi les photos et documents.\n\nPour confirmer, tape : SUPPRIMER"
    )
    if (confirmation !== 'SUPPRIMER') return

    setEnvoi(true); setErreur('')
    try {
      const chemins = [
        ...photos.map(p => p.storage_path),
        ...documents.map(d => d.storage_path),
      ]
      if (chemins.length) {
        await supabase.storage.from('properties').remove(chemins)
      }

      const { error } = await supabase.from('properties').delete().eq('id', b.id)
      if (error) {
        // La base refuse la suppression si le bien est lié à une transaction.
        if (error.code === '23503') {
          throw new Error(
            "Ce bien est rattaché à une transaction. Passe-le plutôt en statut « Retiré »."
          )
        }
        throw new Error(error.message)
      }

      onMaj?.()
      onFermer()
    } catch (err) {
      setErreur(err.message)
      setEnvoi(false)
    }
  }

  function verifier(fichier, typesAutorises) {
    if (fichier.size > MAX_MO * 1024 * 1024) {
      throw new Error(`${fichier.name} dépasse ${MAX_MO} Mo.`)
    }
    if (typesAutorises && !typesAutorises.some(t => fichier.type.startsWith(t))) {
      throw new Error(`${fichier.name} n'est pas un format accepté.`)
    }
  }

  async function envoyerPhotos(e) {
    const fichiers = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!fichiers.length) return

    setEnvoi(true); setErreur('')
    try {
      for (const fichier of fichiers) {
        verifier(fichier, ['image/'])
        const chemin = `${dossier}/photos/${Date.now()}-${nomSur(fichier.name)}`

        const { error: eUp } = await supabase.storage
          .from('properties').upload(chemin, fichier)
        if (eUp) throw new Error(eUp.message)

        const { error: eDb } = await supabase.from('property_photos').insert({
          agency_id: profil.agency_id,
          property_id: b.id,
          storage_path: chemin,
          position: photos.length,
          is_cover: photos.length === 0,
        })
        if (eDb) throw new Error(eDb.message)
      }
      await charger()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  async function envoyerDocument(e) {
    const fichier = e.target.files?.[0]
    e.target.value = ''
    if (!fichier) return

    setEnvoi(true); setErreur('')
    try {
      verifier(fichier)
      const chemin = `${dossier}/docs/${Date.now()}-${nomSur(fichier.name)}`

      const { error: eUp } = await supabase.storage
        .from('properties').upload(chemin, fichier)
      if (eUp) throw new Error(eUp.message)

      const { error: eDb } = await supabase.from('property_documents').insert({
        agency_id: profil.agency_id,
        property_id: b.id,
        kind: typeDoc,
        label: fichier.name,
        storage_path: chemin,
        uploaded_by: profil.id,
      })
      if (eDb) throw new Error(eDb.message)

      await charger()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  async function supprimerFichier(table, ligne) {
    if (!confirm('Supprimer définitivement ce fichier ?')) return
    setErreur('')
    await supabase.storage.from('properties').remove([ligne.storage_path])
    const { error } = await supabase.from(table).delete().eq('id', ligne.id)
    if (error) setErreur(error.message)
    else await charger()
  }

  async function definirCouverture(photo) {
    await supabase.from('property_photos')
      .update({ is_cover: false }).eq('property_id', b.id)
    const { error } = await supabase.from('property_photos')
      .update({ is_cover: true }).eq('id', photo.id)
    if (error) setErreur(error.message)
    else await charger()
  }

  async function ouvrirDocument(doc) {
    const { data, error } = await supabase.storage
      .from('properties').createSignedUrl(doc.storage_path, 300)
    if (error) setErreur(error.message)
    else window.open(data.signedUrl, '_blank', 'noopener')
  }

  const libelle = (liste, v) => liste.find(([x]) => x === v)?.[1] ?? v
  const loue = f && (f.offer === 'location' || f.offer === 'les_deux')
  const vendu = f && (f.offer === 'vente' || f.offer === 'les_deux')

  return (
    <>
      <div className="voile" onClick={onFermer} />

      <aside className="panneau" role="dialog" aria-label={`Fiche de ${b.title}`}>
        <header className="panneau-entete">
          <div>
            <h2>{b.title}</h2>
            <p className="secondaire">
              {libelle(TYPES, b.kind)}
              {b.commune && ` · ${b.commune}`}
              {b.quartier && `, ${b.quartier}`}
            </p>
          </div>
          <button className="bouton secondaire" onClick={onFermer}>Fermer</button>
        </header>

        {erreur && <div className="message-erreur" role="alert">{erreur}</div>}

        <section className="panneau-section">
          <div className="rangee-titre">
            <h3>Fiche du bien</h3>
            {!modeEdition && (
              <button className="bouton secondaire" onClick={ouvrirEdition}>Modifier</button>
            )}
          </div>

          {!modeEdition ? (
            <>
              <dl className="fiche">
                <div><dt>Statut</dt><dd>{libelle(STATUTS, b.status)}</dd></div>
                <div><dt>Offre</dt><dd>{libelle(OFFRES, b.offer)}</dd></div>
                {b.surface_m2 && <div><dt>Superficie</dt><dd>{b.surface_m2} m²</dd></div>}
                {b.rooms && <div><dt>Pièces</dt><dd>{b.rooms}</dd></div>}
                {b.sale_price && (
                  <div><dt>Prix de vente</dt>
                    <dd className="montant">{Number(b.sale_price).toLocaleString('fr-SN')} F</dd></div>
                )}
                {b.rent_monthly && (
                  <div><dt>Loyer</dt>
                    <dd className="montant">{Number(b.rent_monthly).toLocaleString('fr-SN')} F</dd></div>
                )}
                {b.owners?.full_name && (
                  <div><dt>Propriétaire</dt>
                    <dd>{b.owners.full_name}{b.owners.phone ? ` · ${b.owners.phone}` : ''}</dd></div>
                )}
              </dl>

              {b.description && <p className="secondaire recherche-client">{b.description}</p>}

              <button className="lien-nu danger bloc-danger"
                      onClick={supprimerBien} disabled={envoi}>
                Supprimer ce bien
              </button>
            </>
          ) : (
            <form onSubmit={enregistrerFiche}>
              <div className="grille-suivi">
                <label className="champ large">
                  <span>Intitulé</span>
                  <input value={f.title} onChange={maj('title')} required />
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
                  <span>Statut</span>
                  <select value={f.status} onChange={maj('status')}>
                    {STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>

                <label className="champ">
                  <span>Commune</span>
                  <input value={f.commune} onChange={maj('commune')} />
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
                    <input type="number" min="0" value={f.sale_price}
                           onChange={maj('sale_price')} />
                  </label>
                )}

                {loue && (
                  <label className="champ">
                    <span>Loyer mensuel (FCFA)</span>
                    <input type="number" min="0" value={f.rent_monthly}
                           onChange={maj('rent_monthly')} />
                  </label>
                )}

                <label className="champ">
                  <span>Propriétaire</span>
                  <input value={f.owner_name} onChange={maj('owner_name')} />
                </label>

                <label className="champ">
                  <span>Téléphone du propriétaire</span>
                  <input type="tel" value={f.owner_phone} onChange={maj('owner_phone')} />
                </label>

                <label className="champ large">
                  <span>Description</span>
                  <textarea rows={3} value={f.description} onChange={maj('description')} />
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
          <div className="rangee-titre">
            <h3>Photos</h3>
            <label className="bouton secondaire fichier">
              {envoi ? 'Envoi…' : 'Ajouter'}
              <input type="file" accept="image/*" multiple
                     onChange={envoyerPhotos} disabled={envoi} hidden />
            </label>
          </div>

          {chargement ? (
            <p className="vide">Chargement…</p>
          ) : photos.length === 0 ? (
            <p className="vide">Aucune photo. Ajoute au moins une vue du bien.</p>
          ) : (
            <div className="galerie">
              {photos.map(p => (
                <figure className={p.is_cover ? 'vignette couverture' : 'vignette'} key={p.id}>
                  {apercus[p.storage_path]
                    ? <img src={apercus[p.storage_path]} alt="" loading="lazy" />
                    : <div className="vignette-vide" />}
                  <figcaption>
                    {p.is_cover
                      ? <span className="etiquette attente">Couverture</span>
                      : <button className="lien-nu" onClick={() => definirCouverture(p)}>
                          Mettre en couverture
                        </button>}
                    <button className="lien-nu danger"
                            onClick={() => supprimerFichier('property_photos', p)}>
                      Supprimer
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>

        <section className="panneau-section">
          <div className="rangee-titre">
            <h3>Documents</h3>
          </div>

          <div className="ajout-doc">
            <select value={typeDoc} onChange={e => setTypeDoc(e.target.value)}>
              {TYPES_DOC.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label className="bouton secondaire fichier">
              {envoi ? 'Envoi…' : 'Téléverser'}
              <input type="file" accept="image/*,application/pdf"
                     onChange={envoyerDocument} disabled={envoi} hidden />
            </label>
          </div>

          {documents.length === 0 ? (
            <p className="vide">Aucun document. Ajoute le titre foncier ou le bail.</p>
          ) : documents.map(d => (
            <div className="ligne" key={d.id}>
              <div>
                <div className="principal">
                  {TYPES_DOC.find(([v]) => v === d.kind)?.[1] ?? d.kind}
                </div>
                <div className="secondaire">{d.label}</div>
              </div>
              <div className="fin-ligne">
                <button className="lien-nu" onClick={() => ouvrirDocument(d)}>Ouvrir</button>
                <button className="lien-nu danger"
                        onClick={() => supprimerFichier('property_documents', d)}>
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </section>
      </aside>
    </>
  )
}