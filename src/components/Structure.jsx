import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const liens = [
  { to: '/',          libelle: "Aujourd'hui", exact: true },
  { to: '/biens',     libelle: 'Biens' },
  { to: '/clients',   libelle: 'Clients' },
  { to: '/visites',   libelle: 'Visites' },
  { to: '/paiements', libelle: 'Paiements' },
]

export default function Structure() {
  const { profil, deconnexion } = useAuth()

  return (
    <div className="app">
      <header className="barre">
        <div className="marque">Immo<em>.</em></div>
        <div className="barre-droite">
          <span className="qui">{profil?.agencies?.name ?? profil?.full_name}</span>
          <button className="bouton" onClick={deconnexion}>Se déconnecter</button>
        </div>
      </header>

      <div className="corps">
        <nav className="nav">
          {liens.map(l => (
            <NavLink key={l.to} to={l.to} end={l.exact}
                     className={({ isActive }) => isActive ? 'actif' : undefined}>
              {l.libelle}
            </NavLink>
          ))}
        </nav>

        <main className="contenu">
          <Outlet />
        </main>
      </div>
    </div>
  )
}