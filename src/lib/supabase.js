import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error(
    "Clés Supabase manquantes. Crée un fichier .env.local à la racine avec VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY, puis relance npm run dev."
  )
}

export const supabase = createClient(url, key)

/** Formate un montant en francs CFA. */
export function fcfa(montant) {
  if (montant === null || montant === undefined || montant === '') return '—'
  return new Intl.NumberFormat('fr-SN', {
    maximumFractionDigits: 0,
  }).format(Number(montant)) + ' F'
}

/** Formate une date ISO en jour/mois/année. */
export function dateCourte(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(iso))
}