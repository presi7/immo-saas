import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Connexion() {
  const { rafraichirProfil } = useAuth()
  const [mode, setMode] = useState('connexion')   // 'connexion' | 'inscription'
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [nomComplet, setNomComplet] = useState('')
  const [nomAgence, setNomAgence] = useState('')
  const [telephone, setTelephone] = useState('')
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)

  async function seConnecter() {
    const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse })
    if (error) throw new Error("Email ou mot de passe incorrect.")
  }

  async function sInscrire() {
    const { data, error } = await supabase.auth.signUp({ email, password: motDePasse })
    if (error) throw new Error(error.message)

    // Si la confirmation par email est activée, il n'y a pas encore de session.
    if (!data.session) {
      throw new Error("Compte créé. Confirme ton adresse email, puis connecte-toi.")
    }

    const { error: rpcError } = await supabase.rpc('creer_agence_et_profil', {
      p_agency_name: nomAgence,
      p_full_name: nomComplet,
      p_phone: telephone || null,
      p_city: null,
    })
    if (rpcError) throw new Error(rpcError.message)
    await rafraichirProfil()
  }

  async function envoyer(e) {
    e.preventDefault()
    setErreur('')
    setEnCours(true)
    try {
      if (mode === 'connexion') await seConnecter()
      else await sInscrire()
    } catch (err) {
      setErreur(err.message)
    } finally {
      setEnCours(false)
    }
  }

  const inscription = mode === 'inscription'

  return (
    <div className="page-auth">
      <form className="carte-auth" onSubmit={envoyer}>
        <div className="marque">Immo<em>.</em></div>
        <p className="accroche">
          {inscription
            ? "Ouvre le compte de ton agence."
            : "Tes biens, tes clients et tes échéances au même endroit."}
        </p>

        {erreur && <div className="message-erreur" role="alert">{erreur}</div>}

        {inscription && (
          <>
            <label className="champ">
              <span>Nom de l'agence</span>
              <input value={nomAgence} onChange={e => setNomAgence(e.target.value)}
                     required placeholder="Teranga Immobilier" />
            </label>
            <label className="champ">
              <span>Ton nom</span>
              <input value={nomComplet} onChange={e => setNomComplet(e.target.value)}
                     required placeholder="Moussa Ndoye" />
            </label>
            <label className="champ">
              <span>Téléphone</span>
              <input value={telephone} onChange={e => setTelephone(e.target.value)}
                     type="tel" placeholder="77 000 00 00" />
            </label>
          </>
        )}

        <label className="champ">
          <span>Email</span>
          <input value={email} onChange={e => setEmail(e.target.value)}
                 type="email" required autoComplete="email" />
        </label>

        <label className="champ">
          <span>Mot de passe</span>
          <input value={motDePasse} onChange={e => setMotDePasse(e.target.value)}
                 type="password" required minLength={6}
                 autoComplete={inscription ? 'new-password' : 'current-password'} />
        </label>

        <button className="bouton pleine-largeur" disabled={enCours}>
          {enCours ? 'Un instant…' : inscription ? "Créer le compte" : 'Se connecter'}
        </button>

        <p className="bascule-auth">
          {inscription ? 'Tu as déjà un compte ? ' : "Pas encore de compte ? "}
          <button type="button" className="lien-nu"
                  onClick={() => { setMode(inscription ? 'connexion' : 'inscription'); setErreur('') }}>
            {inscription ? 'Se connecter' : 'Créer un compte'}
          </button>
        </p>
      </form>
    </div>
  )
}