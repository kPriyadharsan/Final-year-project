import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

import { API_BASE_URL } from '../config/api'
import { tokenStorage } from '../services/auth.service'

const SocketContext = createContext(null)

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [transport, setTransport] = useState('N/A')
  const joinedRoomsRef = useRef(new Set())

  const apiBaseUrl = API_BASE_URL

  useEffect(() => {
    // Initialize Socket.IO connection with automatic reconnection and authenticated handshake
    const socketInstance = io(apiBaseUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      auth: (cb) => {
        // Dynamically provide current JWT token on handshake/reconnect
        const token = tokenStorage.get()
        cb({ token: token || undefined })
      },
    })

    socketInstance.on('connect', () => {
      setIsConnected(true)
      const currentTransport = socketInstance.io?.engine?.transport?.name || 'websocket'
      setTransport(currentTransport)
      console.log(`[Socket.IO] ⚡ Connected to backend real-time gateway (${socketInstance.id}) via ${currentTransport}`)

      // Re-join any active classroom rooms upon reconnect
      if (joinedRoomsRef.current.size > 0) {
        joinedRoomsRef.current.forEach((room) => {
          socketInstance.emit('join:classroom', room)
          console.log(`[Socket.IO] 🔄 Re-subscribed to room after reconnect: ${room}`)
        })
      }

      if (socketInstance.io?.engine) {
        socketInstance.io.engine.on('upgrade', (rawTransport) => {
          setTransport(rawTransport.name)
          console.log(`[Socket.IO] 🚀 Transport upgraded to: ${rawTransport.name}`)
        })
      }
    })

    socketInstance.on('disconnect', (reason) => {
      setIsConnected(false)
      console.warn(`[Socket.IO] 🔌 Disconnected from real-time gateway: ${reason}`)
    })

    socketInstance.on('connect_error', (error) => {
      setIsConnected(false)
      // Non-fatal warning; Socket.IO will automatically retry with exponential backoff
      console.warn(`[Socket.IO] Gateway connection warning: ${error.message}`)
    })

    socketInstance.on('error:unauthorized', (err) => {
      console.warn('[Socket.IO Security Alert] ⚠️ Unauthorized action:', err.message)
    })

    const handleDemoRevocation = (payload) => {
      console.warn('[Socket.IO] 🛑 Demo presentation session revoked event received:', payload)
      window.dispatchEvent(new CustomEvent('auth:demo_revoked', { detail: payload }))
    }
    socketInstance.on('auth:demo_revoked', handleDemoRevocation)
    socketInstance.on('demo:revoked', handleDemoRevocation)

    setSocket(socketInstance)

    return () => {
      socketInstance.disconnect()
    }
  }, [apiBaseUrl])

  // Helper to join a classroom room (with auto-rejoin tracking)
  const joinClassroom = useCallback((classroom) => {
    if (!classroom) return
    joinedRoomsRef.current.add(classroom)
    if (socket && socket.connected) {
      socket.emit('join:classroom', classroom)
    }
  }, [socket])

  // Helper to leave a classroom room
  const leaveClassroom = useCallback((classroom) => {
    if (!classroom) return
    joinedRoomsRef.current.delete(classroom)
    if (socket && socket.connected) {
      socket.emit('leave:classroom', classroom)
    }
  }, [socket])

  // Helper to cleanly subscribe to an event and return an unsubscribe cleanup function
  const subscribe = useCallback((eventName, handler) => {
    if (!socket || !eventName || typeof handler !== 'function') {
      return () => {}
    }
    socket.on(eventName, handler)
    return () => {
      socket.off(eventName, handler)
    }
  }, [socket])

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        transport,
        joinClassroom,
        leaveClassroom,
        subscribe,
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

/**
 * Access the core Socket.IO context
 */
export function useSocket() {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider')
  }
  return context
}

/**
 * Custom hook to safely listen to a Socket.IO event without duplicate listeners or stale closures
 *
 * @param {string} event - The Socket.IO event name (e.g. 'device:status')
 * @param {Function} handler - The event handler function
 */
export function useSocketEvent(event, handler) {
  const { socket } = useSocket()
  const handlerRef = useRef(handler)

  // Keep latest handler in a ref so component re-renders do NOT re-bind listeners
  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    if (!socket || !event) return

    const eventListener = (...args) => {
      if (typeof handlerRef.current === 'function') {
        handlerRef.current(...args)
      }
    }

    socket.on(event, eventListener)

    return () => {
      socket.off(event, eventListener)
    }
  }, [socket, event])
}
