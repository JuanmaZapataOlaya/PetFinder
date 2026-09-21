from contextlib import asynccontextmanager
import json
import os
from pathlib import Path
from threading import RLock
from typing import Any
from urllib.request import Request, urlopen

import numpy as np
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel, Field, field_validator, model_validator
from turbovec import IdMapIndex


load_dotenv(Path(__file__).with_name(".env"))

VECTOR_DIMENSION = int(os.getenv("VECTOR_DIMENSION", "1536"))
BIT_WIDTH = int(os.getenv("TURBOVEC_BIT_WIDTH", "4"))
INDEX_PATH = Path(os.getenv("TURBOVEC_INDEX_PATH", "data/pet_tickets.tvim"))
IDS_PATH = INDEX_PATH.with_suffix(".ids.json")
SYNC_TOKEN = os.getenv("TURBOVEC_SYNC_TOKEN")
PORTKEY_API_KEY = os.getenv("PORTKEY_API_KEY")
PORTKEY_BASE_URL = os.getenv("PORTKEY_BASE_URL")


class VectorItem(BaseModel):
    id: int = Field(ge=0)
    vector: list[float]
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("vector")
    @classmethod
    def validate_vector(cls, vector: list[float]) -> list[float]:
        if len(vector) != VECTOR_DIMENSION:
            raise ValueError(f"El vector debe tener {VECTOR_DIMENSION} dimensiones")
        if not all(np.isfinite(vector)):
            raise ValueError("El vector solo puede contener valores finitos")
        return vector


class AddRequest(BaseModel):
    vectors: list[VectorItem] = Field(min_length=1)


class SearchRequest(BaseModel):
    vector: list[float] | None = None
    query: str | None = None
    limit: int = Field(default=10, ge=1, le=100)

    @field_validator("vector")
    @classmethod
    def validate_vector(cls, vector: list[float] | None) -> list[float] | None:
        if vector is None:
            return vector
        if len(vector) != VECTOR_DIMENSION:
            raise ValueError(f"El vector debe tener {VECTOR_DIMENSION} dimensiones")
        if not all(np.isfinite(vector)):
            raise ValueError("El vector solo puede contener valores finitos")
        return vector

    @model_validator(mode="after")
    def validate_query_source(self) -> "SearchRequest":
        if self.vector is None and not self.query:
            raise ValueError("Se requiere vector o query")
        return self


class VectorStore:
    def __init__(self) -> None:
        self._lock = RLock()
        self._ids: set[int] = set()
        self._metadata: dict[int, dict[str, Any]] = {}
        self._index = self._load_index()

    def _load_index(self) -> IdMapIndex:
        INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
        if INDEX_PATH.exists():
            index = IdMapIndex.load(str(INDEX_PATH))
            self._ids = self._load_ids()
            self._metadata = self._load_metadata()
            return index
        return IdMapIndex(dim=VECTOR_DIMENSION, bit_width=BIT_WIDTH)

    @staticmethod
    def _load_ids() -> set[int]:
        if not IDS_PATH.exists():
            return set()
        try:
            return {int(item) for item in json.loads(IDS_PATH.read_text())}
        except (OSError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise RuntimeError(f"No se pudo leer el manifiesto {IDS_PATH}") from error

    @staticmethod
    def _metadata_path() -> Path:
        return INDEX_PATH.with_suffix(".metadata.json")

    @classmethod
    def _load_metadata(cls) -> dict[int, dict[str, Any]]:
        path = cls._metadata_path()
        if not path.exists():
            return {}
        try:
            return {int(key): value for key, value in json.loads(path.read_text()).items()}
        except (OSError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise RuntimeError(f"No se pudo leer el manifiesto {path}") from error

    def add(self, items: list[VectorItem]) -> tuple[int, int]:
        ids = [item.id for item in items]
        if len(set(ids)) != len(ids):
            raise ValueError("La solicitud contiene IDs repetidos")

        with self._lock:
            vectors = np.asarray([item.vector for item in items], dtype=np.float32)
            external_ids = np.asarray(ids, dtype=np.uint64)
            existing_ids = set(ids) & self._ids
            for item_id in existing_ids:
                self._index.remove(item_id)
            self._index.add_with_ids(vectors, external_ids)
            self._ids.update(ids)
            self._metadata.update({item.id: item.metadata for item in items})
            self._persist()
            return len(ids) - len(existing_ids), len(existing_ids)

    def search(self, vector: list[float], limit: int) -> list[dict[str, Any]]:
        with self._lock:
            if not self._ids:
                return []
            query = np.asarray([vector], dtype=np.float32)
            scores, ids = self._index.search(query, k=min(limit, len(self._ids)))
            return [
                {"id": int(item_id), "score": float(score), "record": self._metadata.get(int(item_id))}
                for score, item_id in zip(scores[0], ids[0])
            ]

    def _persist(self) -> None:
        if INDEX_PATH.exists():
            self._index.sync(str(INDEX_PATH))
        else:
            self._index.write(str(INDEX_PATH))

        temporary_ids_path = IDS_PATH.with_suffix(".tmp")
        temporary_ids_path.write_text(json.dumps(sorted(self._ids)))
        temporary_ids_path.replace(IDS_PATH)
        metadata_path = self._metadata_path()
        temporary_metadata_path = metadata_path.with_suffix(".tmp")
        temporary_metadata_path.write_text(json.dumps(self._metadata))
        temporary_metadata_path.replace(metadata_path)


def create_embedding(query: str) -> list[float]:
    if not PORTKEY_API_KEY or not PORTKEY_BASE_URL:
        raise HTTPException(status_code=503, detail="El proveedor de embeddings no está configurado")
    request = Request(
        f"{PORTKEY_BASE_URL.rstrip('/')}/embeddings",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-portkey-api-key": PORTKEY_API_KEY,
        },
        data=json.dumps({
            "input": query,
            "model": "@azure-openai/text-embedding-3-small",
            "encoding_format": "float",
        }).encode(),
    )
    try:
        with urlopen(request, timeout=25) as response:
            body = json.loads(response.read())
    except Exception as error:
        raise HTTPException(status_code=502, detail="No se pudo generar el embedding") from error
    embedding = body.get("data", [{}])[0].get("embedding")
    if not isinstance(embedding, list):
        raise HTTPException(status_code=502, detail="El proveedor no devolvió un embedding válido")
    return embedding


store = VectorStore()


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title="PetFinder TurboVec fallback", version="1.0.0", lifespan=lifespan)
allowed_origins = [origin.strip() for origin in os.getenv("TURBOVEC_ALLOWED_ORIGINS", "*").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "vectors": len(store._ids), "dimension": VECTOR_DIMENSION}


def require_sync_token(token: str | None) -> None:
    if SYNC_TOKEN and token != SYNC_TOKEN:
        raise HTTPException(status_code=401, detail="Token de sincronización inválido")


@app.post("/add", status_code=201)
def add_vectors(payload: AddRequest, x_turbovec_token: str | None = Header(default=None)) -> dict[str, Any]:
    require_sync_token(x_turbovec_token)
    try:
        added, updated = store.add(payload.vectors)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {"added": added, "updated": updated, "total": len(store._ids)}


@app.post("/search")
def search_vectors(payload: SearchRequest, x_turbovec_token: str | None = Header(default=None)) -> dict[str, Any]:
    vector = payload.vector or create_embedding(payload.query or "")
    return {"results": store.search(vector, payload.limit)}