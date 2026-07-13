// Maps a Person's stored colour name to its Tailwind dot class. Shared so the
// same swatch renders in the event header, settlements, and itinerary chips.
const COLOR_BG_MAP: Record<string, string> = {
  purple: 'bg-purple-500', blue: 'bg-blue-500', green: 'bg-green-500',
  yellow: 'bg-yellow-500', red: 'bg-red-500', pink: 'bg-pink-500',
  orange: 'bg-orange-500', teal: 'bg-teal-500',
}

export function usePersonColor() {
  function personColorClass(color: string | null | undefined) {
    return (color && COLOR_BG_MAP[color]) || 'bg-slate-400'
  }
  function initial(name: string | null | undefined) {
    return (name?.trim()?.[0] ?? '?').toUpperCase()
  }
  return { personColorClass, initial, COLOR_BG_MAP }
}
