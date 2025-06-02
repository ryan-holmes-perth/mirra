import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pymongo import MongoClient
from pydantic import BaseModel
from typing import List

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def root():
    return FileResponse("static/index.html")

client = MongoClient("mongodb://localhost:27017/")
db = client["testdb"]
users_collection = db["users"]

class User(BaseModel):
    name: str
    age: int

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[WebSocket, bool] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[websocket] = True

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            del self.active_connections[websocket]

    async def send_json(self, message: dict):
        to_remove = []
        for websocket in self.active_connections:
            try:
                await websocket.send_json(message)
            except:
                to_remove.append(websocket)
        for ws in to_remove:
            self.disconnect(ws)

    async def ping_clients(self):
        to_remove = []
        for websocket, is_alive in self.active_connections.items():
            if not is_alive:
                to_remove.append(websocket)
            else:
                self.active_connections[websocket] = False
                try:
                    await websocket.send_json({"type": "ping"})
                except:
                    to_remove.append(websocket)
        for ws in to_remove:
            self.disconnect(ws)

manager = ConnectionManager()

@app.on_event("startup")
async def start_ping():
    async def ping_loop():
        while True:
            await manager.ping_clients()
            await asyncio.sleep(30)
    asyncio.create_task(ping_loop())

@app.post("/users")
async def add_user(user: User):
    users_collection.insert_one(user.dict())
    await manager.send_json({"event": "new_user", "user": user.dict()})
    return {"status": "ok"}

@app.get("/users", response_model=List[User])
def get_users():
    return list(users_collection.find({}, {"_id": 0}))

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Expect client to reply with pong message
            if data == '{"type":"pong"}':
                manager.active_connections[websocket] = True
    except WebSocketDisconnect:
        manager.disconnect(websocket)
