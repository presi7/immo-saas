import { useEffect, useState, useCallback } from 'react'
import { supabase, fcfa, dateCourte } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const MOYENS = [
  ['especes', 'Espèces'],
  ['wave', 'Wave'],
  ['orange_money', 'Orange Money'],
  ['free_money', 'Free Money'],
  ['virement', 'Virement'],
  ['cheque', 'Chèque'],
  ['autre', 'Autre'],
]

const libelle = (liste, v) => liste.find(([x]) => x === v)?.[1] ?? v

export default function PanneauTransaction({ transaction: t, onFermer, onMaj }) {
  const { profil } = useAuth()
  const [echeances, setEcheances] = useState([])
  const [versements, setVersements] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [encaisse, setEncaisse] = useState(null)   // échéance en cours d'encaissement
  const [v, setV] = useState({ amount: '', method: 'especes', reference: '', paid_at: '' })
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  const [nouvelle, setNouvelle] = useState({ label: '', due_date: '', amount_due: '' })

  const charger = useCallback(async () => {
    setChargement(true)
    const [s, p] = await Promise.all([
      supabase.from('payment_schedules')
        .select('id, label, due_date, amount_due, amount_paid, status')
        .eq('deal_id', t.id).order('due_date'),
      supabase.from('payments')
        .select('id, amount, paid_at, method, reference, schedule_id')
        .eq('deal_id', t.id).order('paid_at', { ascending: false }),
    ])

    const souci = [s, p].find(r => r.error)
    if (souci) setErreur(souci.error.message)

    setEcheances(s.data ?? [])
    setVersements(p.data ?? [])
    setChargement(false)
  }, [t.id])

  useEffect(() => { charger() }, [charger])

  const totalDu = echeances.reduce((x, e) => x + Number(e.amount_due), 0)
  const totalPaye = echeances.reduce((x, e) => x + Number(e.amount_paid), 0)
  const reste = totalDu - totalPaye
  const avancement = totalDu > 0 ? Math.round((totalPaye / totalDu) * 100) : 0

  function ouvrirEncaissement(e) {
    setEncaisse(e)
    setV({
      amount: String(Number(e.amount_due) - Number(e.amount_paid)),
      method: 'especes',
      reference: '',
      paid_at: new Date().toISOString().slice(0, 10),
    })
  }

  async function enregistrerVersement() {
    setErreur('')
    const montant = Number(v.amount)
    if (!montant || montant <= 0) { setErreur('Montant invalide.'); return }

    const { error } = await supabase.from('payments').insert({
      agency_id: profil.agency_id,
      deal_id: t.id,
      schedule_id: encaisse.id,
      amount: montant,
      paid_at: v.paid_at,
      method: v.method,
      reference: v.reference.trim() || null,
      recorded_by: profil.id,
    })

    if (error) { setErreur(error.message); return }

    setEncaisse(null)
    await charger()
    onMaj?.()
  }

  async function ajouterEcheance() {
    setErreur('')
    if (!nouvelle.due_date || !nouvelle.amount_due) {
      setErreur('Date et montant sont obligatoires.')
      return
    }

    const { error } = await supabase.from('payment_schedules').insert({
      agency_id: profil.agency_id,
      deal_id: t.id,
      label: nouvelle.label.trim() || null,
      due_date: nouvelle.due_date,
      amount_due: Number(nouvelle.amount_due),
    })

    if (error) { setErreur(error.message); return }

    setNouvelle({ label: '', due_date: '', amount_due: '' })
    setAjoutOuvert(false)
    await charger()
    onMaj?.()
  }

  async function finaliser() {
    if (!confirm('Marquer cette transaction comme finalisée ?')) return
    const { error } = await supabase.from('deals')
      .update({ status: 'finalise' }).eq('id', t.id)
    if (error) { setErreur(error.message); return }
    onMaj?.()
    onFermer()
  }

  /** Reçu prérempli à envoyer au client sur WhatsApp. */
  function recu(paiement) {
    const brut = (t.clients?.whatsapp || t.clients?.phone || '').replace(/[^0-9]/g, '')
    const numero = brut.startsWith('221') ? brut : `221${brut}`
    const texte = encodeURIComponent(
      `Reçu de versement\n\n` +
      `Client : ${t.clients?.full_name}\n` +
      `Bien : ${t.properties?.title}\n` +
      `Montant : ${fcfa(paiement.amount)}\n` +
      `Date : ${dateCourte(paiement.paid_at)}\n` +
      `Mode : ${libelle(MOYENS, paiement.method)}\n` +
      `Reste à payer : ${fcfa(reste)}\n\n` +
      `${profil.agencies?.name ?? ''}`
    )
    return `https://wa.me/${numero}?text=${texte}`
  }

  return (
    <>
      <div className="voile" onClick={onFermer} />

      <aside className="panneau" role="dialog" aria-label="Détail de la transaction">
        <header className="panneau-entete">
          <div>
            <h2>{t.clients?.full_name}</h2>
            <p className="secondaire">
              {t.kind === 'vente' ? 'Vente' : 'Location'} · {t.properties?.title}
            </p>
          </div>
          <button className="bouton secondaire" onClick={onFermer}>Fermer</button>
        </header>

        {erreur && <div className="message-erreur" role="alert">{erreur}</div>}

        <section className="panneau-section">
          <div className="resume-paiement">
            <div>
              <div className="montant gros">{fcfa(totalPaye)}</div>
              <div className="secondaire">encaissé sur {fcfa(totalDu)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="montant gros reste">{fcfa(reste)}</div>
              <div className="secondaire">reste à percevoir</div>
            </div>
          </div>

          <div className="jauge" aria-label={`${avancement}% payé`}>
            <div className="jauge-remplie" style={{ width: `${avancement}%` }} />
          </div>

          {reste <= 0 && t.status === 'en_cours' && (
            <button className="bouton pleine-largeur" onClick={finaliser}>
              Tout est payé — finaliser la transaction
            </button>
          )}
        </section>

        <section className="panneau-section">
          <div className="rangee-titre">
            <h3>Échéancier</h3>
            <button className="bouton secondaire" onClick={() => setAjoutOuvert(!ajoutOuvert)}>
              {ajoutOuvert ? 'Annuler' : 'Ajouter une échéance'}
            </button>
          </div>

          {ajoutOuvert && (
            <div className="ajout-echeance">
              <input placeholder="Libellé (Tranche 7, Loyer mars…)"
                     value={nouvelle.label}
                     onChange={e => setNouvelle({ ...nouvelle, label: e.target.value })} />
              <input type="date" value={nouvelle.due_date}
                     onChange={e => setNouvelle({ ...nouvelle, due_date: e.target.value })} />
              <input type="number" min="0" placeholder="Montant"
                     value={nouvelle.amount_due}
                     onChange={e => setNouvelle({ ...nouvelle, amount_due: e.target.value })} />
              <button className="bouton" onClick={ajouterEcheance}>Ajouter</button>
            </div>
          )}

          {chargement ? (
            <p className="vide">Chargement…</p>
          ) : echeances.length === 0 ? (
            <p className="vide">Aucune échéance. Ajoute-les une par une ci-dessus.</p>
          ) : echeances.map(e => {
            const solde = Number(e.amount_due) - Number(e.amount_paid)
            return (
              <div key={e.id}>
                <div className="ligne">
                  <div>
                    <div className="principal">{e.label ?? 'Échéance'}</div>
                    <div className="secondaire">
                      {dateCourte(e.due_date)}
                      {e.status === 'partiel' && ` · ${fcfa(e.amount_paid)} déjà versé`}
                    </div>
                  </div>
                  <div className="fin-ligne">
                    <div className="montant">{fcfa(e.amount_due)}</div>
                    {e.status === 'paye' ? (
                      <span className="etiquette paye">Payé</span>
                    ) : (
                      <button className="bouton secondaire"
                              onClick={() => ouvrirEncaissement(e)}>
                        Encaisser
                      </button>
                    )}
                  </div>
                </div>

                {encaisse?.id === e.id && (
                  <div className="retour-formulaire">
                    <div className="grille-suivi">
                      <label className="champ">
                        <span>Montant reçu (reste {fcfa(solde)})</span>
                        <input type="number" min="0" value={v.amount}
                               onChange={x => setV({ ...v, amount: x.target.value })} />
                      </label>
                      <label className="champ">
                        <span>Date</span>
                        <input type="date" value={v.paid_at}
                               onChange={x => setV({ ...v, paid_at: x.target.value })} />
                      </label>
                      <label className="champ">
                        <span>Moyen</span>
                        <select value={v.method}
                                onChange={x => setV({ ...v, method: x.target.value })}>
                          {MOYENS.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
                        </select>
                      </label>
                      <label className="champ">
                        <span>Référence</span>
                        <input value={v.reference} placeholder="N° Wave, chèque…"
                               onChange={x => setV({ ...v, reference: x.target.value })} />
                      </label>
                    </div>
                    <div className="actions">
                      <button className="bouton secondaire" onClick={() => setEncaisse(null)}>
                        Annuler
                      </button>
                      <button className="bouton" onClick={enregistrerVersement}>
                        Enregistrer le versement
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </section>

        <section className="panneau-section">
          <h3>Versements reçus</h3>

          {versements.length === 0 ? (
            <p className="vide">Aucun versement enregistré.</p>
          ) : versements.map(p => (
            <div className="ligne" key={p.id}>
              <div>
                <div className="principal montant">{fcfa(p.amount)}</div>
                <div className="secondaire">
                  {dateCourte(p.paid_at)} · {libelle(MOYENS, p.method)}
                  {p.reference && ` · ${p.reference}`}
                </div>
              </div>
              <a className="bouton secondaire" href={recu(p)}
                 target="_blank" rel="noopener noreferrer">
                Envoyer le reçu
              </a>
            </div>
          ))}
        </section>
      </aside>
    </>
  )
}