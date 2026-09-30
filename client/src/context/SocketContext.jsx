import { createContext, useContext, useEffect, useState } from 'react'
import { io } from 'socket.io-client'

const SocketContext = createContext(null)

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [transport, setTransport] = useState('N/A')

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

  useEffect(() => {
    // Initialize Socket.IO connection with graceful reconnects
    const socketInstance = io(apiBaseUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    })

    socketInstance.on('connect', () => {
      setIsConnected(true)
      setTransport(socketInstance.io.engine.transport.name)
      console.log(`[Socket.IO] ⚡ Connected to backend real-time gateway (${socketInstance.id}) via ${socketInstance.io.engine.transport.name}`)

      socketInstance.io.engine.on('upgrade', (rawTransport) => {
        setTransport(rawTransport.name)
        console.log(`[Socket.IO] 🚀 Transport upgraded to: ${rawTransport.name}`)
      })
    })

    socketInstance.on('disconnect', (reason) => {
      setIsConnected(false)
      console.warn(`[Socket.IO] 🔌 Disconnected from real-time gateway: ${reason}`)
    })

    socketInstance.on('connect_error', (error) => {
      setIsConnected(false)
      // Non-fatal warning; will automatically reconnect
      console.warn(`[Socket.IO] Connection warning (retrying automatically): ${error.message}`)
    })

    setSocket(socketInstance)

    return () => {
      socketInstance.disconnect()
    }
  }, [apiBaseUrl])

  return (
    <SocketContext.Provider value={{ socket, isConnected, transport }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider')
  }
  return context
}
