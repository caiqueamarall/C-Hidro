from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from database import Base

class Estacao(Base):
    __tablename__ = "estacoes"

    codigo = Column(String, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    bacia = Column(String)
    sub_bacia = Column(String)
    rio = Column(String)
    estado = Column(String)
    municipio = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    # PostGIS geometry column for map queries
    geom = Column(Geometry(geometry_type='POINT', srid=4326))
    
    medicoes = relationship("MedicaoDiaria", back_populates="estacao")
    chuvas = relationship("PrecipitacaoDiaria", back_populates="estacao")

class MedicaoDiaria(Base):
    __tablename__ = "medicoes_diarias"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    codigo_estacao = Column(String, ForeignKey("estacoes.codigo"), index=True)
    data = Column(DateTime, index=True)
    cota = Column(Float, nullable=True)
    vazao = Column(Float, nullable=True)

    estacao = relationship("Estacao", back_populates="medicoes")

class PrecipitacaoDiaria(Base):
    __tablename__ = 'precipitacao_diaria'

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    codigo_estacao = Column(String, ForeignKey("estacoes.codigo"), index=True)
    data = Column(DateTime, index=True)
    chuva = Column(Float, nullable=True)
    
    estacao = relationship("Estacao", back_populates="chuvas")
