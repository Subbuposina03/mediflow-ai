import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

interface SocketContextType {
  lastMessage: any;
  isConnected: boolean;
  subscribe: (departmentId: number | null) => void;
  unsubscribe: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const socketRef = useRef<WebSocket | null>(null);
  const currentDeptRef = useRef<number | null | undefined>(undefined);

  const unsubscribe = () => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setIsConnected(false);
  };

  const subscribe = (departmentId: number | null) => {
    // Avoid double subscribing to the exact same department
    if (currentDeptRef.current === departmentId && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    unsubscribe();
    currentDeptRef.current = departmentId;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const cleanHost = host.includes('5173') ? host.replace('5173', '8005') : host;
    
    const wsUrl = `${protocol}//${cleanHost}/api/v1/queue/ws${departmentId ? '/' + departmentId : ''}`;
    
    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log(`Connected to WebSocket: ${wsUrl}`);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
        } catch (err) {
          console.error('Error parsing WebSocket frame:', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log('WebSocket connection closed.');
      };

      ws.onerror = (error) => {
        console.error('WebSocket connection error:', error);
      };
    } catch (err) {
      console.error('Failed to instantiate WebSocket:', err);
    }
  };

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ lastMessage, isConnected, subscribe, unsubscribe }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
