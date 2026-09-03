import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Structure from './components/Structure'
import Connexion from './pages/Connexion'
import TableauDeBord from './pages/TableauDeBord'
import Biens from './pages/Biens'
import Clients from './pages/Clients'
import Visites from './pages/Visites'

function EnConstruction({ titre }) {
  return (
    <>
      <div className="entete-page"><h1>{titre}</h1></div>
      <section className="bloc">
        <p className="vide">Cet écran arrive à la prochaine étape.</p>
      </section>
    </>
  )
}

function Routage() {
  const { session, profil, chargement } = useAuth()

  if (chargement) return <p className="vide">Chargement…</p>
  if (!session) return <Connexion />

  // Compte authentifié mais sans profil : l'inscription s'est interrompue.
  if (!profil) {
    return (
      <div className="page-auth">
        <div className="carte-auth">
          <div className="marque">Immo<em>.</em></div>
          <p className="accroche">
            Ce compte n'est rattaché à aucune agence. Reconnecte-toi et termine
            la création du compte, ou demande à ton agence de t'ajouter.
          </p>
          <Connexion />
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<Structure />}>
        <Route index element={<TableauDeBord />} />
        <Route path="biens" element={<Biens />} />
        <Route path="clients" element={<Clients />} />
        <Route path="visites" element={<Visites />} />
        <Route path="paiements" element={<EnConstruction titre="Paiements" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routage />
      </AuthProvider>
    </BrowserRouter>
  )
}