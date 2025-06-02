from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pymongo import MongoClient
from pydantic import BaseModel
from typing import List

app = FastAPI()

# Serve /static/index.html as the root page
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def root():
    return FileResponse("static/index.html")

# Database setup
client = MongoClient("mongodb://localhost:27017/")
db = client["testdb"]
users_collection = db["users"]

class User(BaseModel):
    name: str
    age: int

websockets = set()

@app.post("/users")
async def add_user(user: User):
    users_collection.insert_one(user.dict())
    for ws in websockets:
        await ws.send_json({"event": "new_user", "user": user.dict()})
    return {"status": "ok"}

@app.get("/users", response_model=List[User])
def get_users():
    return list(users_collection.find({}, {"_id": 0}))

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    websockets.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except:
        websockets.remove(websocket)
