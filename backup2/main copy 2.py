import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pymongo import MongoClient
from pydantic import BaseModel, BeforeValidator, Field, ConfigDict, field_serializer
from typing import Annotated, List, Optional
from bson import ObjectId, Any

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the ping loop when app starts
    async def ping_loop():
        while True:
            await manager.ping_clients()
            await asyncio.sleep(30)

    task = asyncio.create_task(ping_loop())
    yield
    # Cleanup on shutdown
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def root():
    return FileResponse("static/index.html")

@app.get("/test")
def rootTest():
    return FileResponse("static/test.html")

client = MongoClient("mongodb://localhost:27017/")
db = client["testdb"]

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

# @app.on_event("startup")
# async def start_ping():
#     async def ping_loop():
#         while True:
#             await manager.ping_clients()
#             await asyncio.sleep(30)
#     asyncio.create_task(ping_loop())

users_collection = db["users"]

class User(BaseModel):
    name: str
    age: int


@app.post("/users")
async def add_user(user: User):
    users_collection.insert_one(user.model_dump())
    await manager.send_json({"event": "new_user", "user": user.model_dump()})
    return {"status": "ok"}

@app.get("/users", response_model=List[User])
def get_users():
    return list(users_collection.find({}, {"_id": 0}))

@app.get("/users/{user_id}", response_model=User)
async def get_user(user_id: str):
    user_data = users_collection.find_one({"_id": user_id})
    if user_data:
        return User(**user_data)
    return {"status": "not_found"}

@app.delete("/users/{user_id}")
async def delete_user(user_id: str):
    result = users_collection.delete_one({"_id": user_id})
    if result.deleted_count > 0:
        await manager.send_json({"event": "delete_user", "user_id": user_id})
        return {"status": "ok"}
    return {"status": "not_found"}

@app.put("/users/{user_id}")
async def update_user(user_id: str, user: User):
    result = users_collection.update_one({"_id": user_id}, {"$set": user.model_dump()})
    if result.modified_count > 0:
        await manager.send_json({"event": "update_user", "user": user.dict()})
        return {"status": "ok"}
    return {"status": "not_found"}

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




def str_objectid(v):
    return str(v) if isinstance(v, ObjectId) else v

StrObjectId = Annotated[Optional[str], BeforeValidator(str_objectid)]

class MirraModel(BaseModel):
    id: StrObjectId = Field(default=None, alias="_id")
    t_: Optional[int] = Field(default=None, alias="_t")
    u_: Optional[str] = Field(default=None, alias="_u")
    x_: Optional[bool] = Field(default=None, alias="_x")

    model_config = ConfigDict(
        populate_by_name=True,
        extra="allow",
        from_attributes=True,
    )



persons_collection = db["persons"]

class Person(MirraModel):
    name: str



@app.post("/persons")
async def add_person(person: Person):
    doc = person.model_dump(by_alias=True, exclude_none=True)  # exclude None fields like _id
    result = persons_collection.insert_one(doc)

    person.id = str(result.inserted_id)

    saved_doc = persons_collection.find_one({"_id": result.inserted_id})

    person = Person.model_validate(saved_doc)

    await manager.send_json({
        "entity": "persons",
        "mode": "create",
        "data": person.model_dump(by_alias=True)
    })

    return person

@app.get("/persons", response_model=List[Person])
def get_persons():
    return list(persons_collection.find({}))
 
@app.get("/persons/{person_id}", response_model=Person)
async def get_person(person_id: str):
    print (f'person_id = {person_id}')
    person_data = persons_collection.find_one({"_id": person_id})
    if person_data:
        return Person(**person_data)
    raise HTTPException(status_code=404, detail="Person not found")

@app.delete("/persons/{person_id}")
async def delete_person(person_id: str):
    result = persons_collection.delete_one({"_id": person_id})
    if result.deleted_count > 0:
        await manager.send_json({"entity": "persons", "mode": "delete", "data": {"_id": person_id}})
        return {"status": "ok"}
    return {"status": "not_found"}

@app.put("/persons/{person_id}")
async def update_person(person_id: str, person: Person):
    result = persons_collection.update_one({"_id": person_id}, {"$set": person.model_dump()})
    if result.modified_count > 0:
        await manager.send_json({"entity": "persons", "mode": "update ", "data": person.model_dump()})
        return {"status": "ok"}
    return {"status": "not_found"}
