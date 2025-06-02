import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pymongo import MongoClient
from pydantic import BaseModel, BeforeValidator, Field, ConfigDict, field_serializer
from typing import Annotated, List, Optional, get_type_hints, Any
from bson import ObjectId

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
        # Send the highest message id to the client
        last_msg = db["messages"].find_one(sort=[("id", -1)])
        last_id = last_msg["id"] if last_msg and "id" in last_msg else 0
        await websocket.send_json({"message": { "last_message_id": last_id } })
        self.active_connections[websocket] = True

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            del self.active_connections[websocket]

    async def send_json(self, message: dict):
        to_remove = []
        for websocket in self.active_connections:
            try:
                await websocket.send_json(message)
                # Save message to db with autoincrement id
                msg = message.copy()
                # Get next autoincrement id
                counter = db["counters"].find_one_and_update(
                    {"_id": "messages"},
                    {"$inc": {"seq": 1}},
                    upsert=True,
                    return_document=True
                )
                msg_id = counter["seq"]
                msg["id"] = msg_id
                db["messages"].insert_one(msg)
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
            data = await websocket.receive_json()
            a = data.get("action")
            
            if a == "pong":
                manager.active_connections[websocket] = True

            elif a == "messagesSince":
                try:
                    last_id = data.get("last_id", 0)
                    # Find all messages with id > last_id
                    messages = list(db["messages"].find({"id": {"$gt": last_id}}, {"_id": 0}))
                    await websocket.send_json({"messages": messages})
                except Exception as e:
                    await websocket.send_json({"error": str(e)})
                
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



from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Type, TypeVar, List, Dict, Any, Optional
from pydantic import BaseModel, create_model
from pymongo.collection import Collection

T = TypeVar("T", bound=BaseModel)

class CRUDRouterFactory:
    def __init__(self, model: Type[T], collection: Collection, entity_name: str):
        self.model = model
        self.collection = collection
        self.entity_name = entity_name

    def get_router(self, route_prefix: str = "") -> APIRouter:
        router = APIRouter()
        Model = self.model
        collection = self.collection
        entity_name = self.entity_name

        @router.post(f"{route_prefix}", response_model=Model)
        async def create_item(item: Model):  # type: ignore
            doc = item.model_dump(by_alias=True, exclude_none=True)
            result = collection.insert_one(doc)
            saved_doc = collection.find_one({"_id": result.inserted_id})
            item = Model.model_validate(saved_doc)
            await manager.send_json({
                "entity": entity_name,
                "mode": "create",
                "data": item.model_dump(by_alias=True)
            })
            return item

        @router.get(f"{route_prefix}", response_model=List[Model])
        def get_all_items(
            skip: int = Query(0, ge=0),
            limit: int = Query(50, le=100),
            sort: Optional[str] = Query(None, description="Comma-separated list of fields. Prefix with '-' for descending."),
            filters: Dict[str, Any] = Depends(self._build_filter_query)
        ):
            sort_clause = self._parse_sort(sort)
            cursor = collection.find(filters).skip(skip).limit(limit)
            if sort_clause:
                cursor = cursor.sort(sort_clause)
            return [Model.model_validate(doc) for doc in cursor]

        @router.get(f"{route_prefix}/{{item_id}}", response_model=Model)
        def get_single_item(item_id: str):
            doc = collection.find_one({"_id": item_id})
            if not doc:
                raise HTTPException(status_code=404, detail="Item not found")
            return Model.model_validate(doc)

        @router.put(f"{route_prefix}/{{item_id}}", response_model=Model)
        async def update_item(item_id: str, update_data: Model):  # type: ignore
            doc = update_data.model_dump(by_alias=True, exclude_none=True)
            result = collection.update_one({"_id": item_id}, {"$set": doc})
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Item not found")
            updated_doc = collection.find_one({"_id": item_id})
            item = Model.model_validate(updated_doc)
            await manager.send_json({
                "entity": f"{route_prefix}/{item_id}",
                "mode": "update",
                "data": item.model_dump(by_alias=True)
            })
            return item

        @router.delete(f"{route_prefix}/{{item_id}}")
        async def delete_item(item_id: str):
            deleted_doc = collection.find_one({"_id": item_id})
            if not deleted_doc:
                raise HTTPException(status_code=404, detail="Item not found")
            result = collection.delete_one({"_id": item_id})
            if result.deleted_count == 0:
                raise HTTPException(status_code=404, detail="Item not found")
            item = Model.model_validate(deleted_doc)
            await manager.send_json({
                "entity": entity_name,
                "mode": "delete",
                "data": item.model_dump(by_alias=True)
            })
            return item

        return router

    def _build_filter_query(self):
        annotations = get_type_hints(self.model)
        fields = {}

        for name, type_hint in annotations.items():
            if name in ("id", "_id"):
                continue
            fields[name] = (Optional[type_hint], Query(default=None))

        FilterModel = create_model(
            f"{self.entity_name.title()}Filters",
            __base__=BaseModel,
            **fields
        )

        async def filter_dependency(query: Any = Depends()):
            return {k: v for k, v in query.model_dump(exclude_none=True).items()}


    def _parse_sort(self, sort: Optional[str]) -> List[tuple]:
        if not sort:
            return []
        sort_fields = []
        for field in sort.split(","):
            field = field.strip()
            if field.startswith("-"):
                sort_fields.append((field[1:], -1))
            else:
                sort_fields.append((field, 1))
        return sort_fields




persons_collection = db["persons"]

class Person(MirraModel):
    name: str




person_crud = CRUDRouterFactory(Person, persons_collection, "persons")
app.include_router(person_crud.get_router("/persons"))





blahs_collection = db["blah"]

class Blah(MirraModel):
    a: str
    b: int
    c: bool

blah_crud = CRUDRouterFactory(Blah, blahs_collection, "blahs")
app.include_router(blah_crud.get_router("/blahs"))

