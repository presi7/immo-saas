import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

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

export default function PanneauBien({ bien, onFermer }) {
  const { profil } = useAuth()
  const [photos, setPhotos] = useState([])
  const [documents, setDocuments] = useState([])
  const [apercus, setApercus] = useState({})
  const [typeDoc, setTypeDoc] = useState('titre_foncier')
  const [chargement, setChargement] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')

  const dossier = `${profil.agency_id}/${bien.id}`

  const charger = useCallback(async () => {
    setChargement(true)
    const [p, d] = await Promise.all([
      supabase.from('property_photos')
        .select('id, storage_path, is_cover, position')
        .eq('property_id', bien.id).order('position'),
      supabase.from('property_documents')
        .select('id, kind, label, storage_path, created_at')
        .eq('property_id', bien.id).order('created_at'),
    ])

    if (p.error || d.error) {
      setErreur((p.error || d.error).message)
      setChargement(false)
      return
    }

    setPhotos(p.data ?? [])
    setDocuments(d.data ?? [])

    // Le bucket est privé : il faut une URL signée pour afficher chaque image.
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
  }, [bien.id])

  useEffect(() => { charger() }, [charger])

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
          property_id: bien.id,
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
        property_id: bien.id,
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

  async function supprimer(table, ligne) {
    if (!confirm('Supprimer définitivement ce fichier ?')) return
    setErreur('')
    await supabase.storage.from('properties').remove([ligne.storage_path])
    const { error } = await supabase.from(table).delete().eq('id', ligne.id)
    if (error) setErreur(error.message)
    else await charger()
  }

  async function definirCouverture(photo) {
    await supabase.from('property_photos')
      .update({ is_cover: false }).eq('property_id', bien.id)
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

  return (
    <>
      <div className="voile" onClick={onFermer} />

      <aside className="panneau" role="dialog" aria-label={`Fichiers de ${bien.title}`}>
        <header className="panneau-entete">
          <div>
            <h2>{bien.title}</h2>
            <p className="secondaire">
              {bien.commune}{bien.quartier ? `, ${bien.quartier}` : ''}
            </p>
          </div>
          <button className="bouton secondaire" onClick={onFermer}>Fermer</button>
        </header>

        {erreur && <div className="message-erreur" role="alert">{erreur}</div>}

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
                            onClick={() => supprimer('property_photos', p)}>
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
                        onClick={() => supprimer('property_documents', d)}>
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