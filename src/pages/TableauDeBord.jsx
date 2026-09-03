import { useEffect, useState } from 'react'
import { supabase, fcfa, dateCourte } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function TableauDeBord() {
  const { profil } = useAuth()
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [biensDispo, setBiensDispo] = useState(0)
  const [prospects, setProspects] = useState(0)
  const [echeances, setEcheances] = useState([])
  const [visites, setVisites] = useState([])

  useEffect(() => {
    let actif = true

    async function charger() {
      try {
        const dans30j = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)

        const [b, c, e, v] = await Promise.all([
          supabase.from('properties')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'disponible'),
          supabase.from('clients')
            .select('id', { count: 'exact', head: true })
            .in('status', ['nouveau', 'en_cours']),
          supabase.from('v_echeances_a_venir')
            .select('*').lte('due_date', dans30j).limit(8),
          supabase.from('visits')
            .select('id, scheduled_at, properties(title), clients(full_name)')
            .eq('status', 'planifiee')
            .gte('scheduled_at', new Date().toISOString())
            .order('scheduled_at').limit(5),
        ])

        if (!actif) return
        const souci = [b, c, e, v].find(r => r.error)
        if (souci) throw new Error(souci.error.message)

        setBiensDispo(b.count ?? 0)
        setProspects(c.count ?? 0)
        setEcheances(e.data ?? [])
        setVisites(v.data ?? [])
      } catch (err) {
        if (actif) setErreur(err.message)
      } finally {
        if (actif) setChargement(false)
      }
    }

    charger()
    return () => { actif = false }
  }, [])

  const enRetard = echeances.filter(e => e.status === 'en_retard')
  const aEncaisser = echeances.reduce((t, e) => t + Number(e.reste_a_payer || 0), 0)

  if (chargement) return <p className="vide">Chargement…</p>

  return (
    <>
      <div className="entete-page">
        <h1>Bonjour {profil?.full_name?.split(' ')[0] ?? ''}</h1>
        <p>Voici ce qui demande ton attention.</p>
      </div>

      {erreur && <div className="message-erreur" role="alert">{erreur}</div>}

      <div className="indicateurs">
        <div className="indicateur">
          <div className="valeur">{biensDispo}</div>
          <div className="libelle">Biens disponibles</div>
        </div>
        <div className="indicateur">
          <div className="valeur">{prospects}</div>
          <div className="libelle">Clients à suivre</div>
        </div>
        <div className="indicateur argent">
          <div className="valeur">{fcfa(aEncaisser)}</div>
          <div className="libelle">À encaisser sous 30 jours</div>
        </div>
        <div className="indicateur retard">
          <div className="valeur">{enRetard.length}</div>
          <div className="libelle">Échéances en retard</div>
        </div>
      </div>

      <section className="bloc">
        <header>
          <h2>Échéances des 30 prochains jours</h2>
        </header>
        {echeances.length === 0 ? (
          <p className="vide">Aucune échéance sur la période. Enregistre une transaction pour créer un échéancier.</p>
        ) : echeances.map(e => (
          <div className="ligne" key={e.id}>
            <div>
              <div className="principal">{e.client}</div>
              <div className="secondaire">{e.label ?? e.bien} · {dateCourte(e.due_date)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="montant">{fcfa(e.reste_a_payer)}</div>
              {e.status === 'en_retard' && <span className="etiquette retard">En retard</span>}
              {e.status === 'partiel' && <span className="etiquette attente">Partiel</span>}
            </div>
          </div>
        ))}
      </section>

      <section className="bloc">
        <header>
          <h2>Prochaines visites</h2>
        </header>
        {visites.length === 0 ? (
          <p className="vide">Aucune visite programmée.</p>
        ) : visites.map(v => (
          <div className="ligne" key={v.id}>
            <div>
              <div className="principal">{v.clients?.full_name}</div>
              <div className="secondaire">{v.properties?.title}</div>
            </div>
            <div className="secondaire">{dateCourte(v.scheduled_at)}</div>
          </div>
        ))}
      </section>
    </>
  )
}