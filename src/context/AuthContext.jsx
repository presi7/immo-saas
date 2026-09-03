import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profil, setProfil] = useState(null)
  const [chargement, setChargement] = useState(true)

  const chargerProfil = useCallback(async (userId) => {
    if (!userId) { setProfil(null); return }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role, agency_id, agencies(name, city)')
      .eq('id', userId)
      .maybeSingle()
    if (error) console.error('Chargement du profil :', error.message)
    setProfil(data ?? null)
  }, [])

  useEffect(() => {
    let actif = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!actif) return
      setSession(data.session)
      await chargerProfil(data.session?.user?.id)
      setChargement(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      if (!actif) return
      setSession(s)
      await chargerProfil(s?.user?.id)
      setChargement(false)
    })

    return () => { actif = false; sub.subscription.unsubscribe() }
  }, [chargerProfil])

  const valeur = {
    session,
    utilisateur: session?.user ?? null,
    profil,
    chargement,
    rafraichirProfil: () => chargerProfil(session?.user?.id),
    deconnexion: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}