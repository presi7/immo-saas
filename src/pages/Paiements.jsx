import { useEffect, useState, useCallback } from 'react'
import { supabase, fcfa, dateCourte } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import PanneauTransaction from '../components/PanneauTransaction'

export const STATUTS_ECHEANCE = [
  ['a_venir', 'À venir'],
  ['partiel', 'Partiel'],
  ['paye', 'Payé'],
  ['en_retard', 'En retard'],
]

const formulaireVide = {
  property_id: '', client_id: '', kind: 'vente',
  total_amount: '', rent_amount: '', deposit_amount: '',
  avance: '', nb_tranches: '6', periodicite: '1',
  premiere_echeance: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
  duree_mois: '12', start_date: new Date().toISOString().slice(0, 10),
  echeancier: 'auto',
}

/** Ajoute n mois à une date ISO, en gardant le jour du mois. */
function plusMois(iso, n) {
  const d = new Date(iso)
  const jour = d.getDate()
  d.setMonth(d.getMonth() + n)
  if (d.getDate() < jour) d.setDate(0)  // évite le 31 février
  return d.toISOString().slice(0, 10)
}

export default function Paiements() {
  const { profil } = useAuth()
  const [onglet, setOnglet] = useState('echeances')
  const [echeances, setEcheances] = useState([])
  const [transactions, setTransactions] = useState([])
  const [biens, setBiens] = useState([])
  const [clients, setClients] = useState([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [f, setF] = useState(formulaireVide)
  const [transactionOuverte, setTransactionOuverte] = useState(null)

  const charger = useCallback(async () => {
    setChargement(true)
    const [e, d, b, c] = await Promise.all([
      supabase.from('v_echeances_a_venir').select('*').limit(100),
      supabase.from('deals')
        .select('id, kind, status, total_amount, rent_amount, start_date, end_date, signed_at, properties(title, commune), clients(id, full_name, phone, whatsapp)')
        .order('created_at', { ascending: false }),
      supabase.from('properties')
        .select('id, title, commune, sale_price, rent_monthly')
        .in('status', ['disponible', 'reserve']),
      supabase.from('clients').select('id, full_name, phone').order('full_name'),
    ])

    const souci = [e, d, b, c].find(r => r.error)
    if (souci) setErreur(souci.error.message)
    else setErreur('')

    setEcheances(e.data ?? [])
    setTransactions(d.data ?? [])
    setBiens(b.data ?? [])
    setClients(c.data ?? [])
    setChargement(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  const maj = (champ) => (e) => setF({ ...f, [champ]: e.target.value })
  const nb = (v) => (v === '' ? null : Number(v))

  /** Construit les lignes d'échéancier selon le type de transaction. */
  function construireEcheances(deal_id) {
    const lignes = []

    if (f.kind === 'vente') {
      const total = Number(f.total_amount)
      const avance = Number(f.avance || 0)
      const tranches = Number(f.nb_tranches)
      const pas = Number(f.periodicite)

      if (avance > 0) {
        lignes.push({
          label: 'Avance',
          due_date: f.start_date,
          amount_due: avance,
        })
      }

      const reste = total - avance
      if (reste > 0 && tranches < 1) {
        // Pas de tranches demandées : une seule échéance pour le solde.
        lignes.push({
          label: 'Solde',
          due_date: f.premiere_echeance,
          amount_due: reste,
        })
      } else if (reste > 0) {
        // La dernière tranche absorbe l'arrondi pour tomber juste sur le total.
        const base = Math.floor(reste / tranches)
        for (let i = 0; i < tranches; i++) {
          lignes.push({
            label: `Tranche ${i + 1}/${tranches}`,
            due_date: plusMois(f.premiere_echeance, i * pas),
            amount_due: i === tranches - 1 ? reste - base * (tranches - 1) : base,
          })
        }
      }
    } else {
      const loyer = Number(f.rent_amount)
      const mois = Number(f.duree_mois)
      const caution = Number(f.deposit_amount || 0)

      if (caution > 0) {
        lignes.push({
          label: 'Caution',
          due_date: f.start_date,
          amount_due: caution,
        })
      }

      for (let i = 0; i < mois; i++) {
        const date = plusMois(f.start_date, i)
        const nomMois = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
          .format(new Date(date))
        lignes.push({
          label: `Loyer ${nomMois}`,
          due_date: date,
          amount_due: loyer,
        })
      }
    }

    return lignes.map(l => ({ ...l, agency_id: profil.agency_id, deal_id }))
  }

  async function enregistrer(e) {
    e.preventDefault()
    setEnvoi(true); setErreur('')
    try {
      const { data: deal, error } = await supabase.from('deals').insert({
        agency_id: profil.agency_id,
        property_id: f.property_id,
        client_id: f.client_id,
        agent_id: profil.id,
        kind: f.kind,
        status: 'en_cours',
        total_amount: f.kind === 'vente' ? nb(f.total_amount) : null,
        rent_amount: f.kind === 'location' ? nb(f.rent_amount) : null,
        deposit_amount: nb(f.deposit_amount),
        start_date: f.start_date,
        end_date: f.kind === 'location'
          ? plusMois(f.start_date, Number(f.duree_mois)) : null,
        signed_at: f.start_date,
      }).select('id').single()

      if (error) throw new Error(error.message)

      if (f.echeancier === 'auto') {
        const lignes = construireEcheances(deal.id)
        if (lignes.length) {
          const { error: eSched } = await supabase.from('payment_schedules').insert(lignes)
          if (eSched) throw new Error(eSched.message)
        }
      }

      // Le bien passe en réservé tant que la transaction n'est pas soldée.
      await supabase.from('properties')
        .update({ status: 'reserve' }).eq('id', f.property_id)

      setF(formulaireVide)
      setOuvert(false)
      setOnglet('echeances')
      await charger()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnvoi(false)
    }
  }

  const aujourdhui = new Date().toISOString().slice(0, 10)
  const enRetard = echeances.filter(e => e.status === 'en_retard')
  const total30 = echeances
    .filter(e => e.due_date <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10))
    .reduce((t, e) => t + Number(e.reste_a_payer || 0), 0)

  const manqueDonnees = biens.length === 0 || clients.length === 0
  const vente = f.kind === 'vente'

  return (
    <>
      <div className="entete-page rangee">
        <div>
          <h1>Paiements</h1>
          <p>
            {echeances.length} échéance{echeances.length > 1 ? 's' : ''} ouverte{echeances.length > 1 ? 's' : ''}
            {enRetard.length > 0 && ` · ${enRetard.length} en retard`}
          </p>
        </div>
        <button className="bouton" onClick={() => setOuvert(!ouvert)} disabled={manqueDonnees}>
          {ouvert ? 'Annuler' : 'Nouvelle transaction'}
        </button>
      </div>

      {erreur && <div className="message-erreur" role="alert">{erreur}</div>}

      {manqueDonnees && (
        <div className="message-info">
          Pour créer une transaction, il faut au moins un bien et un client enregistrés.
        </div>
      )}

      {ouvert && (
        <form className="bloc formulaire" onSubmit={enregistrer}>
          <header><h2>Nouvelle transaction</h2></header>

          <div className="grille">
            <label className="champ">
              <span>Nature</span>
              <select value={f.kind} onChange={maj('kind')}>
                <option value="vente">Vente</option>
                <option value="location">Location</option>
              </select>
            </label>

            <label className="champ">
              <span>Bien</span>
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
              <span>{vente ? 'Date de signature' : 'Début du bail'}</span>
              <input type="date" value={f.start_date} onChange={maj('start_date')} required />
            </label>

            {vente ? (
              <label className="champ">
                <span>Prix de vente convenu (FCFA)</span>
                <input type="number" min="0" value={f.total_amount}
                       onChange={maj('total_amount')} required />
              </label>
            ) : (
              <>
                <label className="champ">
                  <span>Loyer mensuel (FCFA)</span>
                  <input type="number" min="0" value={f.rent_amount}
                         onChange={maj('rent_amount')} required />
                </label>
                <label className="champ">
                  <span>Caution (FCFA)</span>
                  <input type="number" min="0" value={f.deposit_amount}
                         onChange={maj('deposit_amount')} />
                </label>
                <label className="champ">
                  <span>Durée du bail (mois)</span>
                  <input type="number" min="1" max="60" value={f.duree_mois}
                         onChange={maj('duree_mois')} />
                </label>
              </>
            )}

            <label className="champ large">
              <span>Échéancier</span>
              <select value={f.echeancier} onChange={maj('echeancier')}>
                <option value="auto">Générer automatiquement</option>
                <option value="manuel">Saisir les échéances moi-même</option>
              </select>
            </label>

            {f.echeancier === 'auto' && vente && (
              <>
                <label className="champ">
                  <span>Avance versée (FCFA)</span>
                  <input type="number" min="0" value={f.avance} onChange={maj('avance')} />
                </label>
                <label className="champ">
                  <span>Nombre de tranches</span>
                  <input type="number" min="1" max="60" value={f.nb_tranches}
                         onChange={maj('nb_tranches')} required />
                </label>
                <label className="champ">
                  <span>Tous les combien</span>
                  <select value={f.periodicite} onChange={maj('periodicite')}>
                    <option value="1">Chaque mois</option>
                    <option value="3">Chaque trimestre</option>
                    <option value="6">Chaque semestre</option>
                    <option value="12">Chaque année</option>
                  </select>
                </label>
                <label className="champ">
                  <span>Première tranche le</span>
                  <input type="date" value={f.premiere_echeance}
                         onChange={maj('premiere_echeance')} />
                </label>
              </>
            )}
          </div>

          <div className="actions">
            <button type="button" className="bouton secondaire" onClick={() => setOuvert(false)}>
              Annuler
            </button>
            <button className="bouton" disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Créer la transaction'}
            </button>
          </div>
        </form>
      )}

      <div className="indicateurs">
        <div className="indicateur argent">
          <div className="valeur">{fcfa(total30)}</div>
          <div className="libelle">À encaisser sous 30 jours</div>
        </div>
        <div className="indicateur retard">
          <div className="valeur">{enRetard.length}</div>
          <div className="libelle">Échéances en retard</div>
        </div>
        <div className="indicateur">
          <div className="valeur">{transactions.filter(t => t.status === 'en_cours').length}</div>
          <div className="libelle">Transactions en cours</div>
        </div>
      </div>

      <div className="onglets">
        <button className={onglet === 'echeances' ? 'actif' : ''}
                onClick={() => setOnglet('echeances')}>Échéances</button>
        <button className={onglet === 'transactions' ? 'actif' : ''}
                onClick={() => setOnglet('transactions')}>Transactions</button>
      </div>

      <section className="bloc">
        {chargement ? (
          <p className="vide">Chargement…</p>
        ) : onglet === 'echeances' ? (
          echeances.length === 0 ? (
            <p className="vide">Aucune échéance ouverte. Crée une transaction pour en générer.</p>
          ) : echeances.map(e => (
            <div className="ligne" key={e.id}>
              <div>
                <div className="principal">{e.client}</div>
                <div className="secondaire">{e.label} · {e.bien}</div>
              </div>
              <div className="fin-ligne">
                <div style={{ textAlign: 'right' }}>
                  <div className="montant">{fcfa(e.reste_a_payer)}</div>
                  <div className="secondaire">{dateCourte(e.due_date)}</div>
                </div>
                {e.status === 'en_retard' && <span className="etiquette retard">En retard</span>}
                {e.status === 'partiel' && <span className="etiquette attente">Partiel</span>}
              </div>
            </div>
          ))
        ) : (
          transactions.length === 0 ? (
            <p className="vide">Aucune transaction enregistrée.</p>
          ) : transactions.map(t => (
            <div className="ligne" key={t.id}>
              <div className="cliquable" role="button" tabIndex={0}
                   onClick={() => setTransactionOuverte(t)}
                   onKeyDown={ev => ev.key === 'Enter' && setTransactionOuverte(t)}>
                <div className="principal">{t.clients?.full_name}</div>
                <div className="secondaire">
                  {t.kind === 'vente' ? 'Vente' : 'Location'} · {t.properties?.title}
                  {t.signed_at && ` · ${dateCourte(t.signed_at)}`}
                </div>
              </div>
              <div className="fin-ligne">
                <div className="montant">
                  {t.kind === 'vente' ? fcfa(t.total_amount) : `${fcfa(t.rent_amount)} / mois`}
                </div>
                <span className="etiquette">
                  {t.status === 'en_cours' ? 'En cours'
                    : t.status === 'finalise' ? 'Finalisée' : 'Annulée'}
                </span>
              </div>
            </div>
          ))
        )}
      </section>

      {transactionOuverte && (
        <PanneauTransaction
          transaction={transactionOuverte}
          onFermer={() => setTransactionOuverte(null)}
          onMaj={charger}
        />
      )}
    </>
  )
}