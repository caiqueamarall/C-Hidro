import json
from database import mongo_db

pacajas = mongo_db["raw_estacoes"].find_one({"codigo": "19985000"}, {"_id": 0})
with open("mongo_dump.json", "w") as f:
    json.dump(pacajas, f, indent=2, default=str)
