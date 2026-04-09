import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { Square } from './components/Square.jsx'
import { TURNS } from './constants.js'
import { checkWinnerFrom } from './logic/board.js'
import { WinnerModal } from './components/WinnerModal.jsx'
import { hasSupabaseEnv, supabase } from './lib/supabase.js'

const EMPTY_BOARD = Array(9).fill(null)
const DRAW = 'draw'
const ROLES = {
  HOST: 'host',
  GUEST: 'guest',
  SPECTATOR: 'spectator'
}

const createInitialGame = (roomId, playerId) => ({
  id: roomId,
  board: EMPTY_BOARD,
  turn: TURNS.X,
  winner: null,
  host_player_id: playerId,
  guest_player_id: null,
  host_name: '',
  guest_name: '',
  host_symbol: TURNS.X,
  starting_turn: TURNS.X
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

const getPlayerName = () => window.localStorage.getItem('player-name') ?? ''

const savePlayerName = (name) => {
  window.localStorage.setItem('player-name', name)
}

const getWinnerValue = (winner) => {
  if (winner === DRAW) return false
  return winner
}

const getRoleFromGame = (game, playerId) => {
  if (game.host_player_id === playerId) return ROLES.HOST
  if (game.guest_player_id === playerId) return ROLES.GUEST
  return ROLES.SPECTATOR
}

const getSymbolForRole = (game, role) => {
  if (role === ROLES.HOST) return game.host_symbol
  if (role === ROLES.GUEST) return game.host_symbol === TURNS.X ? TURNS.O : TURNS.X
  return null
}

const getStatusMessage = ({ loading, game, role, playerSymbol, isMyTurn }) => {
  if (loading) return 'Conectando sala...'
  if (!playerSymbol && role === ROLES.SPECTATOR) return 'La sala ya tiene dos jugadores. Estas viendo como espectador.'
  if (role === ROLES.HOST && !game.guest_player_id) return 'Esperando a tu pareja para completar la sala.'
  if (role === ROLES.HOST) return `Eres anfitrion y juegas como ${playerSymbol}.`
  if (role === ROLES.GUEST) return `Juegas como ${playerSymbol}. ${isMyTurn ? 'Es tu turno.' : 'Espera tu turno.'}`
  return 'Sala lista.'
}

function App () {
  const [roomId] = useState(() => getRoomId())
  const [playerId] = useState(() => getPlayerId())
  const [game, setGame] = useState(() => createInitialGame(roomId, playerId))
  const [role, setRole] = useState(ROLES.HOST)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const [draftName, setDraftName] = useState(() => getPlayerName())

  const board = game.board ?? EMPTY_BOARD
  const turn = game.turn ?? TURNS.X
  const winner = getWinnerValue(game.winner)
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`
  const playerSymbol = getSymbolForRole(game, role)
  const occupiedSeats = [game.host_player_id, game.guest_player_id].filter(Boolean).length
  const isBoardFull = useMemo(
    () => board.every((square) => square !== null),
    [board]
  )
  const isMyTurn = playerSymbol === turn
  const isRoomReady = Boolean(game.host_player_id && game.guest_player_id)
  const canPlay = Boolean(playerSymbol) && !game.winner && isMyTurn && isRoomReady
  const status = getStatusMessage({ loading, game, role, playerSymbol, isMyTurn })
  const inviteMessage = `Juega conmigo Tic Tac Toe: ${shareUrl}`
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(inviteMessage)}`

  useEffect(() => {
    if (!hasSupabaseEnv) {
      setLoading(false)
      setError('Faltan las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.')
      return
    }

    let active = true

    const fetchGame = async () => {
      const { data, error: selectError } = await supabase
        .from('games')
        .select('*')
        .eq('id', roomId)
        .maybeSingle()

      if (selectError) throw selectError
      return data
    }

    const ensureGameExists = async () => {
      const existingGame = await fetchGame()
      if (existingGame) return existingGame

      const { data, error: insertError } = await supabase
        .from('games')
        .insert(createInitialGame(roomId, playerId))
        .select()
        .single()

      if (insertError) throw insertError
      return data
    }

    const claimRole = async (currentGame) => {
      if (currentGame.host_player_id === playerId) return { game: currentGame, nextRole: ROLES.HOST }
      if (currentGame.guest_player_id === playerId) return { game: currentGame, nextRole: ROLES.GUEST }

      if (!currentGame.host_player_id) {
        const { data, error: hostError } = await supabase
          .from('games')
          .update({ host_player_id: playerId })
          .eq('id', roomId)
          .is('host_player_id', null)
          .select()
          .maybeSingle()

        if (hostError) throw hostError
        if (data) return { game: data, nextRole: ROLES.HOST }
        return claimRole(await fetchGame())
      }

      if (!currentGame.guest_player_id) {
        const { data, error: guestError } = await supabase
          .from('games')
          .update({ guest_player_id: playerId })
          .eq('id', roomId)
          .is('guest_player_id', null)
          .select()
          .maybeSingle()

        if (guestError) throw guestError
        if (data) return { game: data, nextRole: ROLES.GUEST }
        return claimRole(await fetchGame())
      }

      return { game: currentGame, nextRole: ROLES.SPECTATOR }
    }

    const setupRoom = async () => {
      try {
        const currentGame = await ensureGameExists()
        const claimResult = await claimRole(currentGame)

        if (!active) return

        setGame(claimResult.game)
        setRole(claimResult.nextRole)
      } catch (setupError) {
        if (!active) return
        setError(setupError.message)
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
          if (!payload.new || !active) return
          setGame(payload.new)
          setRole(getRoleFromGame(payload.new, playerId))
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

  useEffect(() => {
    if (!shared) return

    const timeoutId = window.setTimeout(() => {
      setShared(false)
    }, 2000)

    return () => window.clearTimeout(timeoutId)
  }, [shared])

  const updateGame = async (nextValues) => {
    const { data, error: updateError } = await supabase
      .from('games')
      .update(nextValues)
      .eq('id', roomId)
      .select()
      .single()

    if (updateError) throw updateError
    setGame(data)
    setRole(getRoleFromGame(data, playerId))
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
    } catch {
      setError('No pude copiar el enlace. Copialo manualmente desde la barra del navegador.')
    }
  }

  const handleShareRoom = async () => {
    if (!navigator.share) {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
      return
    }

    try {
      await navigator.share({
        title: 'Tic Tac Toe Online',
        text: 'Entra a mi sala y juguemos.',
        url: shareUrl
      })
      setShared(true)
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') {
        setError('No pude abrir el menu de compartir.')
      }
    }
  }

  const handleCreateNewRoom = () => {
    const newRoomId = createRoomId()
    window.location.assign(`${window.location.origin}${window.location.pathname}?room=${newRoomId}`)
  }

  const saveNameToRoom = async () => {
    if (!draftName.trim() || role === ROLES.SPECTATOR) return

    const trimmedName = draftName.trim().slice(0, 24)
    const columnName = role === ROLES.HOST ? 'host_name' : 'guest_name'

    try {
      await updateGame({ [columnName]: trimmedName })
      savePlayerName(trimmedName)
      setDraftName(trimmedName)
      setError('')
    } catch (saveError) {
      setError(saveError.message)
    }
  }

  const updateHostSettings = async (nextSettings) => {
    if (role !== ROLES.HOST) return

    try {
      const mergedSettings = {
        host_symbol: nextSettings.host_symbol ?? game.host_symbol,
        starting_turn: nextSettings.starting_turn ?? game.starting_turn
      }

      await updateGame({
        ...mergedSettings,
        board: EMPTY_BOARD,
        turn: mergedSettings.starting_turn,
        winner: null
      })
      setError('')
    } catch (settingsError) {
      setError(settingsError.message)
    }
  }

  const resetGame = async () => {
    if (!hasSupabaseEnv || !playerSymbol) return

    try {
      await updateGame({
        board: EMPTY_BOARD,
        turn: game.starting_turn ?? TURNS.X,
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

  const hostName = game.host_name || 'Anfitrion'
  const guestName = game.guest_name || 'Invitado'
  const guestSymbol = game.host_symbol === TURNS.X ? TURNS.O : TURNS.X

  return (
    <main className='board'>
      <header className='room-card'>
        <p className='eyebrow'>Sala online</p>
        <h1>Tic Tac Toe</h1>
        <p className='room-id'>Codigo: {roomId}</p>
        <p className='status'>{status}</p>

        <section className='share-card'>
          <div>
            <p className='setup-title'>Invita a alguien</p>
            <p className='hint'>Comparte esta sala mientras sigues jugando. Ambos deben abrir exactamente el mismo link.</p>
          </div>
          <div className='share-link-box'>
            <span>{shareUrl}</span>
          </div>
          <div className='share-meta'>
            <span>{occupiedSeats}/2 jugadores dentro</span>
            <span>{role === ROLES.SPECTATOR ? 'Modo espectador' : `Tu rol: ${role}`}</span>
          </div>
        </section>

        <div className='actions'>
          <button onClick={handleCopyLink} type='button'>
            {copied ? 'Link copiado' : 'Copiar link'}
          </button>
          <button onClick={handleShareRoom} type='button'>
            {shared ? 'Invitacion enviada' : 'Compartir sala'}
          </button>
          <a className='action-link' href={whatsappUrl} target='_blank' rel='noreferrer'>
            Enviar por WhatsApp
          </a>
          <button onClick={handleCreateNewRoom} type='button'>
            Crear nueva sala
          </button>
          <button onClick={resetGame} type='button' disabled={!playerSymbol}>
            Reiniciar
          </button>
        </div>

        <div className='name-form'>
          <input
            type='text'
            value={draftName}
            maxLength={24}
            placeholder='Pon tu nombre'
            onChange={(event) => setDraftName(event.target.value)}
          />
          <button onClick={saveNameToRoom} type='button' disabled={!draftName.trim() || role === ROLES.SPECTATOR}>
            Guardar nombre
          </button>
        </div>

        <section className='players-card'>
          <div className='player-chip'>
            <span>{hostName}</span>
            <strong>{game.host_symbol}</strong>
          </div>
          <div className='player-chip'>
            <span>{guestName}</span>
            <strong>{guestSymbol}</strong>
          </div>
        </section>

        {role === ROLES.HOST && (
          <section className='setup-card'>
            <p className='setup-title'>Configura la partida</p>
            <div className='setup-grid'>
              <div>
                <p className='setup-label'>Tu ficha</p>
                <div className='inline-actions'>
                  <button
                    className={game.host_symbol === TURNS.X ? 'is-active' : ''}
                    onClick={() => updateHostSettings({ host_symbol: TURNS.X })}
                    type='button'
                  >
                    Quiero ser X
                  </button>
                  <button
                    className={game.host_symbol === TURNS.O ? 'is-active' : ''}
                    onClick={() => updateHostSettings({ host_symbol: TURNS.O })}
                    type='button'
                  >
                    Quiero ser O
                  </button>
                </div>
              </div>

              <div>
                <p className='setup-label'>Empieza</p>
                <div className='inline-actions'>
                  <button
                    className={game.starting_turn === TURNS.X ? 'is-active' : ''}
                    onClick={() => updateHostSettings({ starting_turn: TURNS.X })}
                    type='button'
                  >
                    Empieza X
                  </button>
                  <button
                    className={game.starting_turn === TURNS.O ? 'is-active' : ''}
                    onClick={() => updateHostSettings({ starting_turn: TURNS.O })}
                    type='button'
                  >
                    Empieza O
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {!loading && playerSymbol && (
          <p className='hint'>
            Tu ficha es <strong>{playerSymbol}</strong>. {isRoomReady ? (isMyTurn ? 'Es tu turno.' : 'Espera el turno rival.') : 'Esperando al segundo jugador.'}
          </p>
        )}

        {!loading && !playerSymbol && (
          <p className='hint'>La sala admite dos jugadores. Si quieres jugar, crea una sala nueva.</p>
        )}

        {error && <p className='error'>{error}</p>}
      </header>

      <section className='game'>
        {board.map((square, index) => (
          <Square
            key={index}
            index={index}
            updateBoard={updateBoard}
          >
            {square}
          </Square>
        ))}
      </section>

      <section className='turn'>
        <Square isSelected={turn === TURNS.X}>
          {TURNS.X}
        </Square>
        <Square isSelected={turn === TURNS.O}>
          {TURNS.O}
        </Square>
      </section>

      <p className='hint'>
        {!isRoomReady
          ? 'La partida se activa cuando entren dos jugadores.'
          : isBoardFull && !game.winner
              ? 'Tablero lleno.'
              : 'La partida se sincroniza en tiempo real.'}
      </p>

      <WinnerModal resetGame={resetGame} winner={winner} />
    </main>
  )
}

export default App
