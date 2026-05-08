import { SleeperPlayer } from '@/types'

export const getSleeperPlayerName = (player: SleeperPlayer): string => {
  const name = [player.first_name, player.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  return name || 'Unknown Player'
}
