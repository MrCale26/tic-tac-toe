import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { Square } from './components/Square.jsx'
import { TURNS } from './constants.js'
import { checkWinnerFrom } from './logic/board.js'
import { WinnerModal } from './components/WinnerModal.jsx'
import { hasSupabaseEnv, supabase } from './lib/supabase.js'

const EMPTY_BOARD = Array(9).fill(null)
const DRAW = 'draw'

const createInitialGame = (roomId) => ({
  id: roomId,
  board: EMPTY_BOARD,
  turn: TURNS.X,
  winner: null,
  x_player_id: null,
  o_player_id: null
})

const createRoomId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().split('-')[0]
  }

  return Math.random().toString(36).slice(2, 10)
}

const getRoomId = () => {
  const url = new URL(window.location.href)
  const roomFromQuery = url.searchParams.get('room')

  if (roomFromQuery) return roomFromQuery

  const newRoomId = createRoomId()
  url.searchParams.set('room', newRoomId)
  window.history.replaceState({}, '', url)
  return newRoomId
}

const getPlayerId = () => {
  const savedPlayerId = window.localStorage.getItem('player-id')
  if (savedPlayerId) return savedPlayerId

  const newPlayerId = crypto.randomUUID()
  window.localStorage.setItem('player-id', newPlayerId)
  return newPlayerId
}

const getWinnerValue = (winner) => {
  if (winner === DRAW) return false
  return winner
}

function App () {
  const [roomId] = useState(() => getRoomId())
  const [playerId] = useState(() => getPlayerId())
  const [game, setGame] = useState(() => createInitialGame(roomId))
  const [playerSymbol, setPlayerSymbol] = useState(null)
  const [status, setStatus] = useState('Conectando sala...')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const board = game.board ?? EMPTY_BOARD
  const turn = game.turn ?? TURNS.X
  const winner = getWinnerValue(game.winner)
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`

  const isBoardFull = useMemo(
    () => board.every((square) => square !== null),
    [board]
  )

  const isMyTurn = playerSymbol === turn
  const canPlay = Boolean(playerSymbol) && !game.winner && isMyTurn

  useEffect(() => {
    if (!hasSupabaseEnv) {
      setLoading(false)
      setError('Faltan las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.')
      setStatus('Configura Supabase para habilitar el modo online.')
      return
    }

    let active = true

    const fetchGame = async () => {
      const { data: currentGame, error: selectError } = await supabase
        .from('games')
        .select('*')
        .eq('id', roomId)
        .maybeSingle()

      if (selectError) throw selectError
      return currentGame
    }

    const ensureGameExists = async () => {
      const existingGame = await fetchGame()
      if (existingGame) return existingGame

      const { data: insertedGame, error: insertError } = await supabase
        .from('games')
        .insert(createInitialGame(roomId))
        .select()
        .single()

      if (insertError) throw insertError
      return insertedGame
    }

    const claimSeat = async (currentGame) => {
      if (currentGame.x_player_id === playerId) return { game: currentGame, symbol: TURNS.X }
      if (currentGame.o_player_id === playerId) return { game: currentGame, symbol: TURNS.O }

      if (!currentGame.x_player_id) {
        const { data, error: updateError } = await supabase
          .from('games')
          .update({ x_player_id: playerId })
          .eq('id', roomId)
          .is('x_player_id', null)
          .select()
          .maybeSingle()

        if (updateError) throw updateError
        if (data) return { game: data, symbol: TURNS.X }
        return claimSeat(await fetchGame())
      }

      if (!currentGame.o_player_id) {
        const { data, error: updateError } = await supabase
          .from('games')
          .update({ o_player_id: playerId })
          .eq('id', roomId)
          .is('o_player_id', null)
          .select()
          .maybeSingle()

        if (updateError) throw updateError
        if (data) return { game: data, symbol: TURNS.O }
        return claimSeat(await fetchGame())
      }

      return { game: currentGame, symbol: null }
    }

    const setupRoom = async () => {
      try {
        const currentGame = await ensureGameExists()
        const seatResult = await claimSeat(currentGame)

        if (!active) return

        setGame(seatResult.game)
        setPlayerSymbol(seatResult.symbol)
        setStatus(
          seatResult.symbol
            ? `Juegas como ${seatResult.symbol}.`
            : 'La sala ya tiene dos jugadores. Estás viendo como espectador.'
        )
      } catch (setupError) {
        if (!active) return
        setError(setupError.message)
        setStatus('No se pudo conectar la sala.')
      } finally {
        if (active) setLoading(false)
      }
    }

    setupRoom()

    const channel = supabase
      .channel(`game-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${roomId}`
        },
        (payload) => {
          const nextGame = payload.new
          if (!nextGame || !active) return
          setGame(nextGame)
        }
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [playerId, roomId])

  useEffect(() => {
    if (!copied) return

    const timeoutId = window.setTimeout(() => {
      setCopied(false)
    }, 2000)

    return () => window.clearTimeout(timeoutId)
  }, [copied])

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
    } catch {
      setError('No pude copiar el enlace. Copialo manualmente desde la barra del navegador.')
    }
  }

  const updateGame = async (nextValues) => {
    const { data, error: updateError } = await supabase
      .from('games')
      .update(nextValues)
      .eq('id', roomId)
      .select()
      .single()

    if (updateError) throw updateError
    setGame(data)
  }

  const resetGame = async () => {
    if (!hasSupabaseEnv || !playerSymbol) return

    try {
      await updateGame({
        board: EMPTY_BOARD,
        turn: TURNS.X,
        winner: null
      })
      setError('')
    } catch (resetError) {
      setError(resetError.message)
    }
  }

  const updateBoard = async (index) => {
    if (!hasSupabaseEnv || !canPlay || board[index]) return

    const newBoard = [...board]
    newBoard[index] = turn

    const nextWinner = checkWinnerFrom(newBoard)
    const nextBoardFull = newBoard.every((square) => square !== null)
    const nextTurn = turn === TURNS.X ? TURNS.O : TURNS.X

    try {
      await updateGame({
        board: newBoard,
        turn: nextWinner || nextBoardFull ? turn : nextTurn,
        winner: nextWinner ?? (nextBoardFull ? DRAW : null)
      })
      setError('')
    } catch (updateError) {
      setError(updateError.message)
    }
  }

  return (
    <main className='board'>
      <header className='room-card'>
        <p className='eyebrow'>Sala online</p>
        <h1>Tic Tac Toe</h1>
        <p className='room-id'>Codigo: {roomId}</p>
        <p className='status'>{status}</p>
        <div className='actions'>
          <button onClick={handleCopyLink} type='button'>
            {copied ? 'Link copiado' : 'Copiar link'}
          </button>
          <button onClick={resetGame} type='button' disabled={!playerSymbol}>
            Reiniciar
          </button>
        </div>
        <p className='hint'>
          Comparte este enlace con tu pareja: <a href={shareUrl}>{shareUrl}</a>
        </p>
        {!loading && playerSymbol && (
          <p className='hint'>
            Tu ficha es <strong>{playerSymbol}</strong>. {isMyTurn ? 'Es tu turno.' : 'Espera el turno rival.'}
          </p>
        )}
        {!loading && !playerSymbol && (
          <p className='hint'>La sala admite dos jugadores. Si quieres jugar, crea una sala nueva.</p>
        )}
        {error && <p className='error'>{error}</p>}
      </header>

      <section className='game'>
        {
          board.map((square, index) => {
            return (
              <Square
                key={index}
                index={index}
                updateBoard={updateBoard}
              >
                {square}
              </Square>
            )
          })
        }
      </section>

      <section className='turn'>
        <Square isSelected={turn === TURNS.X}>
          {TURNS.X}
        </Square>
        <Square isSelected={turn === TURNS.O}>
          {TURNS.O}
        </Square>
      </section>

      <p className='hint'>{isBoardFull && !game.winner ? 'Tablero lleno.' : 'La partida se sincroniza en tiempo real.'}</p>

      <WinnerModal resetGame={resetGame} winner={winner} />
    </main>
  )
}

export default App
