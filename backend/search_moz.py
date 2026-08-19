from database import db
res = list(db.estacoes.find({"nome": {"$regex": "moz", "$options": "i"}}, {"nome": 1, "codigo": 1, "_id": 0}))
print("MOZ:", res)
res2 = list(db.estacoes.find({"nome": {"$regex": "xingu", "$options": "i"}}, {"nome": 1, "codigo": 1, "_id": 0}))
print("XINGU:", res2)
