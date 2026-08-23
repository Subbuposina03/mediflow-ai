from fastapi import WebSocket
from typing import List, Dict, Set
import json

class ConnectionManager:
    def __init__(self):
        # We can map connection rooms, e.g., by department_id or active dashboards
        self.active_connections: Set[WebSocket] = set()
        self.department_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, department_id: int = None):
        await websocket.accept()
        self.active_connections.add(websocket)
        if department_id is not None:
            if department_id not in self.department_connections:
                self.department_connections[department_id] = set()
            self.department_connections[department_id].add(websocket)

    def disconnect(self, websocket: WebSocket, department_id: int = None):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if department_id is not None and department_id in self.department_connections:
            if websocket in self.department_connections[department_id]:
                self.department_connections[department_id].remove(websocket)

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_json(message)
        except Exception:
            # Connection might have died
            pass

    async def broadcast(self, message: dict, department_id: int = None):
        targets = self.active_connections
        if department_id is not None:
            targets = self.department_connections.get(department_id, set())

        dead_connections = []
        for connection in list(targets):
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.append(connection)

        # Cleanup any dead connections
        for connection in dead_connections:
            self.active_connections.discard(connection)
            if department_id is not None and department_id in self.department_connections:
                self.department_connections[department_id].discard(connection)

manager = ConnectionManager()
